const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

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

module.exports = router;
