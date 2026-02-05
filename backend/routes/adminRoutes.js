const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// --- SYSTEM SETTINGS ---

// 1. GET Settings
router.get('/settings', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM system_settings WHERE id = 1');
    if (result.rows.length === 0) {
      return res.json({ market_status: 'OPEN', simulated_date: new Date() });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// 2. UPDATE Settings
router.post('/settings', async (req, res) => {
  try {
    const { market_status, simulated_date } = req.body;
    const updateQuery = `
      UPDATE system_settings 
      SET market_status = $1, simulated_date = $2 
      WHERE id = 1 
      RETURNING *
    `;
    const result = await pool.query(updateQuery, [market_status, simulated_date]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// --- STOCK MANAGEMENT ---

// 3. GET All Stocks (Admin View)
router.get('/stocks', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM stocks ORDER BY symbol ASC');
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// 4. ADD New Stock
router.post('/stocks', async (req, res) => {
    try {
        const { symbol, name, base_price, volatility, sector } = req.body;
        
        // Default current_price to base_price on creation
        const query = `
            INSERT INTO stocks (symbol, name, base_price, current_price, volatility, sector)
            VALUES ($1, $2, $3, $3, $4, $5)
            RETURNING *
        `;
        
        const result = await pool.query(query, [symbol.toUpperCase(), name, base_price, volatility, sector]);
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: err.message });
    }
});

// 5. UPDATE Stock
router.put('/stocks/:symbol', async (req, res) => {
    try {
        const { symbol } = req.params;
        const { volatility, base_price, sector } = req.body;
        
        const query = `
            UPDATE stocks 
            SET volatility = $1, base_price = $2, sector = $3
            WHERE symbol = $4
            RETURNING *
        `;
        
        const result = await pool.query(query, [volatility, base_price, sector, symbol]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Stock not found" });
        }
        
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: err.message });
    }
});

// 6. DELETE Stock
router.delete('/stocks/:symbol', async (req, res) => {
    try {
        const { symbol } = req.params;
        await pool.query('DELETE FROM stocks WHERE symbol = $1', [symbol]);
        res.json({ message: "Stock deleted" });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- UTILITY TOOLS ---

// 7. SQL EXECUTION TOOL (For Admin SQL Tab)
router.post('/sql', async (req, res) => {
    try {
        const { query } = req.body;
        if (!query) return res.status(400).json({ error: "Query is required" });

        console.log("Executing Admin SQL:", query);
        const result = await pool.query(query);
        
        // Return rows for SELECT, rowCount for INSERT/UPDATE
        res.json({ 
            command: result.command,
            rowCount: result.rowCount,
            rows: result.rows 
        });
    } catch (err) {
        console.error("SQL Error:", err.message);
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;
