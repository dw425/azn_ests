const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const seedRoutes = require('./backend/routes/seedRoutes'); 

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// --- THE DATA CHECK ---
// This will print the exact column names to your logs when the server starts
pool.connect().then(async client => {
    console.log('✅ Connected to Database');
    try {
        const res = await client.query('SELECT * FROM stocks LIMIT 1');
        console.log('👀 DATABASE COLUMNS REVEALED:', Object.keys(res.rows[0]));
    } catch (err) {
        console.error('❌ Data Check Failed:', err.message);
    } finally {
        client.release();
    }
}).catch(err => console.error('❌ DB Connection Error:', err));
// ---------------------

app.get('/', (req, res) => res.send('Stock Trading API is Live!'));
app.use('/api/admin', seedRoutes);

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
