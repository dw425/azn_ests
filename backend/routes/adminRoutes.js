// backend/routes/adminRoutes.js
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

// Database Connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// 1. GET Current System Settings
// This allows the frontend to know if the market is Open or Closed
router.get('/settings', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM system_settings WHERE id = 1');
    if (result.rows.length === 0) {
      // Fallback if table is empty
      return res.json({ market_status: 'OPEN', simulated_date: new Date() });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// 2. UPDATE System Settings
// This is what the Admin Button will hit to "Close Market" or Change Date
router.post('/settings', async (req, res) => {
  try {
    const { market_status, simulated_date } = req.body;

    // Update the single row (ID 1) with new values
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

module.exports = router;
