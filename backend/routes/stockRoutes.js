const express = require('express');
const router = express.Router();
const db = require('../db'); // <--- SINGLETON CONNECTION

// GET /api/stocks
router.get('/', async (req, res) => {
    // We can use db.query directly (it handles the pool)
    try {
        const query = `
            SELECT 
                s.stock_id, 
                s.ticker, 
                s.name as company_name, 
                s.sector,
                s.volatility,
                s.current_price,
                s.volume,
                s.daily_open,
                s.day_high,
                s.day_low,
                (s.volume * s.current_price) as market_cap,
                
                -- Today %: current_price vs daily_open (intraday change)
                CASE 
                    WHEN s.daily_open IS NOT NULL AND s.daily_open > 0 
                    THEN ((s.current_price - s.daily_open) / s.daily_open) * 100 
                    ELSE 0 
                END as today_pct,

                -- Rolling %: current_price vs base_price (since inception)
                CASE 
                    WHEN s.base_price IS NOT NULL AND s.base_price > 0 
                    THEN ((s.current_price - s.base_price) / s.base_price) * 100 
                    ELSE 0 
                END as rolling_pct

            FROM stocks s
            ORDER BY s.ticker ASC;
        `;

        const result = await db.query(query);
        res.json(result.rows);

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await db.query('SELECT * FROM stocks WHERE stock_id = $1', [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Stock not found' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
