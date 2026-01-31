const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

// --- IMPORT ROUTES ---
// Corrected Path: We must look inside the 'backend' folder
const seedRoutes = require('./backend/routes/seedRoutes'); 

const app = express();
const PORT = process.env.PORT || 10000;

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json()); // Allows us to parse JSON bodies from requests

// --- DATABASE CONNECTION CHECK ---
// This ensures we are connected when the server starts
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

pool.connect()
    .then(() => console.log('✅ Connected to PostgreSQL Database'))
    .catch(err => console.error('❌ Database Connection Error:', err));

// --- ROUTES ---

// 1. Health Check Route (To verify server is running)
app.get('/', (req, res) => {
    res.send('Stock Trading API is Live!');
});

// 2. Admin Routes (For our "Time Travel" Data Generator)
app.use('/api/admin', seedRoutes);

// --- START SERVER ---
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
