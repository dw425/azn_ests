const express = require('express');
const router = express.Router();
const db = require('../db'); // Singleton DB

// 1. GET PORTFOLIO SUMMARY (Cash, Stock Value, Total)
router.get('/summary/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        // Get Cash Balance
        const walletRes = await db.query('SELECT balance FROM wallets WHERE user_id = $1', [userId]);
        if (walletRes.rows.length === 0) {
            return res.json({ cash: 0, stockValue: 0, totalValue: 0, dayChange: 0, dayChangePct: 0 });
        }

        const cash = Number(walletRes.rows[0].balance);

        // Get Stock Value (Current Price * Quantity)
        const holdingsRes = await db.query(`
            SELECT h.quantity, s.current_price, s.base_price
            FROM holdings h
            JOIN stocks s ON h.stock_id = s.stock_id
            WHERE h.user_id = $1
        `, [userId]);

        let stockValue = 0;
        let dayStartValue = 0;

        holdingsRes.rows.forEach(row => {
            const qty = Number(row.quantity);
            const curr = Number(row.current_price);
            const base = Number(row.base_price); // Treating base_price as "Open Price" for day calc
            
            stockValue += qty * curr;
            dayStartValue += qty * base;
        });

        const totalValue = cash + stockValue;
        const dayChange = stockValue - dayStartValue;
        const dayChangePct = dayStartValue > 0 ? (dayChange / dayStartValue) * 100 : 0;

        res.json({
            cash,
            stockValue,
            totalValue,
            dayChange,
            dayChangePct
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// 2. GET HOLDINGS (Detailed List)
router.get('/holdings/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const query = `
            SELECT 
                h.stock_id, 
                s.ticker, 
                s.name as company_name, 
                h.quantity, 
                s.current_price, 
                h.average_buy_price,
                (s.current_price * h.quantity) as market_value,
                ((s.current_price - h.average_buy_price) * h.quantity) as total_gain,
                (s.current_price - s.base_price) as day_change
            FROM holdings h
            JOIN stocks s ON h.stock_id = s.stock_id
            WHERE h.user_id = $1
            ORDER BY market_value DESC
        `;
        const result = await db.query(query, [userId]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// 3. GET CHART DATA (Real Historical Calculation)
router.get('/chart/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        // 1. Get current wallet cash (Assume constant for simplicity in this MVP)
        const walletRes = await db.query('SELECT balance FROM wallets WHERE user_id = $1', [userId]);
        const cash = walletRes.rows[0] ? Number(walletRes.rows[0].balance) : 0;

        // 2. Get history of current holdings
        // This query sums up (Price * Quantity) for every day in history
        const query = `
            SELECT 
                p.recorded_at::DATE as date,
                SUM(p.price * h.quantity) as stock_value
            FROM holdings h
            JOIN stock_prices p ON h.stock_id = p.stock_id
            WHERE h.user_id = $1
            AND p.recorded_at > NOW() - INTERVAL '30 days'
            GROUP BY p.recorded_at::DATE
            ORDER BY date ASC
        `;
        
        const result = await db.query(query, [userId]);
        
        // 3. Format for Frontend (Add Cash to Stock Value)
        const chartData = result.rows.map(row => ({
            day: new Date(row.date).toLocaleDateString(),
            value: Number(row.stock_value) + cash
        }));

        // If no history (new user), return flat line
        if (chartData.length === 0) {
            return res.json([
                { day: 'Start', value: cash },
                { day: 'Now', value: cash }
            ]);
        }

        res.json(chartData);

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
