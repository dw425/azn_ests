const express = require('express');
const router = express.Router();
const db = require('../db'); // Singleton

// --- SYSTEM SETTINGS ---
router.get('/settings', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM system_settings WHERE id = 1');
    if (result.rows.length === 0) {
      return res.json({ market_status: 'OPEN', simulated_date: new Date() });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

router.post('/settings', async (req, res) => {
  try {
    const { market_status, simulated_date } = req.body;
    const updateQuery = `
      UPDATE system_settings 
      SET market_status = $1, simulated_date = $2 
      WHERE id = 1 
      RETURNING *
    `;
    const result = await db.query(updateQuery, [market_status, simulated_date]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// --- STOCK MANAGEMENT ---

// GET All Stocks
router.get('/stocks', async (req, res) => {
    try {
        // FIXED: Order by ticker, not symbol
        const result = await db.query('SELECT * FROM stocks ORDER BY ticker ASC');
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// ADD New Stock
router.post('/stocks', async (req, res) => {
    try {
        // Frontend sends 'symbol', we map it to 'ticker' for DB
        const { symbol, name, base_price, volatility, sector } = req.body;
        
        const query = `
            INSERT INTO stocks (ticker, name, base_price, current_price, volatility, sector)
            VALUES ($1, $2, $3, $3, $4, $5)
            RETURNING *
        `;
        
        const result = await db.query(query, [symbol.toUpperCase(), name, base_price, volatility, sector]);
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: err.message });
    }
});

// UPDATE Stock
router.put('/stocks/:ticker', async (req, res) => {
    try {
        const { ticker } = req.params;
        const { volatility, base_price, sector } = req.body;
        
        // FIXED: Where ticker = $4
        const query = `
            UPDATE stocks 
            SET volatility = $1, base_price = $2, sector = $3
            WHERE ticker = $4
            RETURNING *
        `;
        
        const result = await db.query(query, [volatility, base_price, sector, ticker]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Stock not found" });
        }
        
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: err.message });
    }
});

// DELETE Stock
router.delete('/stocks/:ticker', async (req, res) => {
    try {
        const { ticker } = req.params;
        // FIXED: Where ticker = $1
        await db.query('DELETE FROM stocks WHERE ticker = $1', [ticker]);
        res.json({ message: "Stock deleted" });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- SQL TOOL ---
router.post('/sql', async (req, res) => {
    try {
        const { query } = req.body;
        if (!query) return res.status(400).json({ error: "Query is required" });
        const result = await db.query(query);
        res.json({ command: result.command, rowCount: result.rowCount, rows: result.rows });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;
