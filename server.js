const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

// --- IMPORT ROUTES ---
// Now that you moved the file, this path will be correct:
const seedRoutes = require('./backend/routes/seedRoutes'); 

const app = express();
const PORT = process.env.PORT || 10000;

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json());

// --- DATABASE CONNECTION ---
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

pool.connect()
    .then(() => console.log('✅ Connected to PostgreSQL Database'))
    .catch(err => console.error('❌ Database Connection Error:', err));

// --- ROUTES ---
app.get('/', (req, res) => res.send('Stock Trading API is Live!'));

// Admin Route for Data Generation
app.use('/api/admin', seedRoutes);

// --- START SERVER ---
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
