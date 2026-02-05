const { Pool } = require('pg');
require('dotenv').config();

// --- SINGLETON DATABASE CONNECTION ---
// This file ensures we only have ONE connection pool for the entire app.
// It prevents the "Connection Exhaustion" crashes you saw earlier.

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Required for Render/Cloud DBs
  max: 20, // Strict limit to prevent locking up the free tier DB
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Global Error Handler for the Pool
pool.on('error', (err, client) => {
  console.error('❌ Unexpected error on idle client', err);
  process.exit(-1);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool // Export raw pool for transactions (BEGIN/COMMIT/ROLLBACK)
};
