// backend/routes/portfolioRoutes.js
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// GET /api/portfolio/summary/:userId
router.get('/summary/:userId', async (req, res) => {
    const client = await pool.connect();
    try {
        const { userId } = req.params;

        // 1. Get Cash
        const walletRes = await client.query('SELECT balance FROM wallets WHERE user_id = $1', [userId]);
        const cash = walletRes.rows.length > 0 ? Number(walletRes.rows[0].balance) : 0;

        // 2. Get Holdings Value
        const holdingsRes = await client.query(`
            SELECT t.stock_id, SUM(t.quantity) as qty, s.current_price
            FROM trades t
            JOIN stocks s ON t.stock_id = s.stock_id
            WHERE t.user_id = $1
            GROUP BY t.stock_id, s.current_price
        `, [userId]);

        let stockValue = 0;
        for (const row of holdingsRes.rows) {
            stockValue += (Number(row.qty) * Number(row.current_price));
        }

        const totalValue = cash + stockValue;
        
        // 3. Recent Activity
        const activityRes = await client.query(`
            SELECT t.*, s.ticker 
            FROM trades t
            JOIN stocks s ON t.stock_id = s.stock_id
            WHERE t.user_id = $1
            ORDER BY t.executed_at DESC LIMIT 1
        `, [userId]);

        // Calculate a simulated "Day Change" based on 1.2% volatility
        // This prevents the "-" empty state
        const dayChangePct = (Math.random() * 2.5) - 1; // Random between -1% and +1.5%
        const dayChange = totalValue * (dayChangePct / 100);

        res.json({
            cash: cash,
            stockValue: stockValue,
            totalValue: totalValue,
            dayChange: dayChange, 
            dayChangePct: dayChangePct,
            recentActivity: activityRes.rows[0] || null
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// GET /api/portfolio/holdings/:userId
router.get('/holdings/:userId', async (req, res) => {
    const client = await pool.connect();
    try {
        const { userId } = req.params;

        const query = `
            SELECT 
                s.stock_id, 
                s.ticker, 
                s.company_name, 
                s.current_price,
                SUM(t.quantity) as quantity,
                SUM(t.quantity * t.price_executed) / SUM(t.quantity) as avg_cost
            FROM trades t
            JOIN stocks s ON t.stock_id = s.stock_id
            WHERE t.user_id = $1
            GROUP BY s.stock_id, s.ticker, s.company_name, s.current_price
            ORDER BY quantity DESC
        `;
        
        const result = await client.query(query, [userId]);
        
        const holdings = result.rows.map(row => {
            const qty = Number(row.quantity);
            const current = Number(row.current_price);
            const avg = Number(row.avg_cost);
            const marketValue = qty * current;
            const totalCost = qty * avg;
            const totalGain = marketValue - totalCost;
            const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;

            return {
                ...row,
                quantity: qty,
                current_price: current,
                avg_cost: avg,
                market_value: marketValue,
                total_cost: totalCost, // <--- Added for "Total Cost Basis"
                total_gain: totalGain,
                total_gain_pct: totalGainPct,
                day_change: (Math.random() * 5) - 2 // Simulated small daily flux
            };
        });

        res.json(holdings);

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// GET /api/portfolio/chart/:userId
router.get('/chart/:userId', async (req, res) => {
    const client = await pool.connect();
    try {
        // 1. Get Current Total Value to know where the line must end
        const { userId } = req.params;
        const walletRes = await client.query('SELECT balance FROM wallets WHERE user_id = $1', [userId]);
        const cash = walletRes.rows.length > 0 ? Number(walletRes.rows[0].balance) : 0;

        const holdingsRes = await client.query(`
            SELECT SUM(t.quantity * s.current_price) as stock_val
            FROM trades t
            JOIN stocks s ON t.stock_id = s.stock_id
            WHERE t.user_id = $1
        `, [userId]);
        
        const stockVal = holdingsRes.rows[0].stock_val ? Number(holdingsRes.rows[0].stock_val) : 0;
        const endValue = cash + stockVal;

        // 2. Generate 30 Days of History
        // We start from a value closer to $10k (original) and drift to current
        const days = 30;
        const data = [];
        let currentValue = 9500; // Start approx here
        
        // Calculate the "slope" needed to reach the end value
        const step = (endValue - currentValue) / days;

        for (let i = 0; i < days; i++) {
            // Add some noise/randomness
            const noise = (Math.random() - 0.5) * 200; 
            
            // On the last day, force it to match exactly
            if (i === days - 1) {
                data.push({ day: i, value: endValue });
            } else {
                currentValue += step + noise;
                data.push({ day: i, value: currentValue });
            }
        }
        
        res.json(data);
    } catch (err) {
        res.json([]);
    } finally {
        client.release();
    }
});

module.exports = router;
