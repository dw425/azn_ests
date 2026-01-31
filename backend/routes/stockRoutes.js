// backend/routes/stockRoutes.js
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// GET /api/stocks - Get all stocks and their current price
router.get('/', async (req, res) => {
    const client = await pool.connect();
    try {
        const result = await client.query('SELECT stock_id, ticker, company_name, sector, current_price FROM stocks ORDER BY stock_id ASC');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch stocks' });
    } finally {
        client.release();
    }
});

// GET /api/stocks/:id - Get details for ONE stock
router.get('/:id', async (req, res) => {
    const client = await pool.connect();
    try {
        const stockId = req.params.id;
        const result = await client.query('SELECT * FROM stocks WHERE stock_id = $1', [stockId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Stock not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch stock details' });
    } finally {
        client.release();
    }
});

module.exports = router;
