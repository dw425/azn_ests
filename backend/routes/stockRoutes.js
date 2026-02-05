const express = require('express');
const router = express.Router();
const db = require('../db'); // <--- SINGLETON CONNECTION

// GET /api/stocks
router.get('/', async (req, res) => {
    // We can use db.query directly (it handles the pool)
    try {
        const query = `
            WITH latest_prices AS (
                SELECT DISTINCT ON (stock_id) stock_id, price as close_price, recorded_at
                FROM stock_prices
                WHERE recorded_at <= NOW() 
                ORDER BY stock_id, recorded_at DESC
            ),
            thirty_day_prices AS (
                SELECT DISTINCT ON (stock_id) stock_id, price as old_price
                FROM stock_prices
                WHERE recorded_at <= NOW() - INTERVAL '30 days'
                ORDER BY stock_id, recorded_at DESC
            )
            SELECT 
                s.stock_id, 
                s.ticker, 
                s.company_name, 
                s.sector,
                s.volatility,
                s.current_price,
                
                CASE 
                    WHEN EXTRACT(ISODOW FROM NOW()) IN (6, 7) THEN 0
                    WHEN lp.close_price IS NOT NULL AND lp.close_price > 0 
                    THEN ((s.current_price - lp.close_price) / lp.close_price) * 100 
                    ELSE 0 
                END as today_pct,

                CASE 
                    WHEN tdp.old_price IS NOT NULL AND tdp.old_price > 0 
                    THEN ((s.current_price - tdp.old_price) / tdp.old_price) * 100 
                    ELSE 0 
                END as rolling_pct

            FROM stocks s
            LEFT JOIN latest_prices lp ON s.stock_id = lp.stock_id
            LEFT JOIN thirty_day_prices tdp ON s.stock_id = tdp.stock_id
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
