// utils/priceEngine.js
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function getCurrentPrice(ticker) {
    const query = `
        SELECT price FROM stock_prices 
        WHERE stock_id = (SELECT stock_id FROM stocks WHERE ticker = $1)
        AND recorded_at <= NOW() 
        ORDER BY recorded_at DESC 
        LIMIT 1;
    `;
    const res = await pool.query(query, [ticker]);
    return res.rows[0] ? res.rows[0].price : null;
}
