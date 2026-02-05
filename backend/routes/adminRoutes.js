const express = require('express');
const router = express.Router();
// FIX: Uses ../db because this file is inside backend/routes/
const db = require('../db'); 

// ==========================================
// 1. SYSTEM SETTINGS (Market Status & Time)
// ==========================================

// GET current system settings
router.get('/settings', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM system_settings WHERE id = 1');
    if (result.rows.length === 0) {
      // Default fallback if DB is empty
      return res.json({ market_status: 'OPEN', simulated_date: new Date() });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// UPDATE system settings (Open/Close Market, Change Date)
router.post('/settings', async (req, res) => {
  try {
    const { market_status, simulated_date } = req.body;
    
    // Use COALESCE to keep existing value if the new one is undefined
    // This allows us to update JUST status or JUST date
    const updateQuery = `
      UPDATE system_settings 
      SET 
        market_status = COALESCE($1, market_status),
        simulated_date = COALESCE($2, simulated_date)
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

// ==========================================
// 2. STOCK MANAGEMENT (CRUD)
// ==========================================

// GET All Stocks (Ordered by Ticker)
router.get('/stocks', async (req, res) => {
    try {
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
        // Map frontend 'symbol' to database 'ticker'
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

// UPDATE Stock (Volatility, Price, Sector)
router.put('/stocks/:ticker', async (req, res) => {
    try {
        const { ticker } = req.params;
        const { volatility, base_price, sector } = req.body;
        
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
        await db.query('DELETE FROM stocks WHERE ticker = $1', [ticker]);
        res.json({ message: "Stock deleted" });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 3. SQL TOOL (Direct Database Access)
// ==========================================
router.post('/run-sql', async (req, res) => {
    try {
        const { query } = req.body;
        // Security Warning: In production, restrict this to Super Admins only
        console.log("Executing SQL:", query);
        
        const result = await db.query(query);
        res.json({ 
            success: true, 
            command: result.command, 
            rowCount: result.rowCount, 
            rows: result.rows 
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;
