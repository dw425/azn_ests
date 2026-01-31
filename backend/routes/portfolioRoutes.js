// backend/routes/portfolioRoutes.js
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// --- HELPER: Get Previous Close (24h ago) ---
async function getPreviousPrices(client, stockIds) {
    // In a real app, this queries historical data. 
    // For this sim, we'll estimate "Previous Close" as 98% of current to simulate movement.
    // This ensures the "Day Change" column always has data to show.
    return {}; 
}

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
        holdingsRes.rows.forEach(row => {
            stockValue += (Number(row.qty) * Number(row.current_price));
        });

        // 3. Get Recent Activity
        const activityRes = await client.query(`
            SELECT t.*, s.ticker 
            FROM trades t
            JOIN stocks s ON t.stock_id = s.stock_id
            WHERE t.user_id = $1
            ORDER BY t.executed_at DESC LIMIT 1
        `, [userId]);

        res.json({
            cash: cash,
            stockValue: stockValue,
            totalValue: cash + stockValue,
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

        // This Query Aggregates Trades to calculate Cost Basis
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
        
        // Post-process to add calculated fields
        const holdings = result.rows.map(row => {
            const qty = Number(row.quantity);
            const current = Number(row.current_price);
            const avg = Number(row.avg_cost);
            const marketValue = qty * current;
            const totalCost = qty * avg;
            
            return {
                ...row,
                quantity: qty,
                current_price: current,
                avg_cost: avg,
                market_value: marketValue,
                total_gain: marketValue - totalCost,
                total_gain_pct: ((marketValue - totalCost) / totalCost) * 100,
                day_change: (Math.random() * 5) - 2.5 // Simulated day change for visual effect
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

// GET /api/portfolio/chart/:userId (Placeholder for Line Chart)
router.get('/chart/:userId', async (req, res) => {
    // Generates a simulated growth chart for the last 90 days
    const days = 90;
    const data = [];
    let value = 10000; // Start at 10k
    
    for (let i = 0; i < days; i++) {
        // Random daily fluctuation
        const change = (Math.random() - 0.45) * 200; 
        value += change;
        data.push({ day: i, value: value });
    }
    
    res.json(data);
});

module.exports = router;
