const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

// --- IMPORT ROUTES ---
const seedRoutes = require('./backend/routes/seedRoutes'); 
const authRoutes = require('./backend/routes/authRoutes'); // <--- NEW

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

// --- DB CONNECTION ---
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

pool.connect()
    .then(() => console.log('✅ Connected to Database'))
    .catch(err => console.error('❌ DB Connection Error:', err));

// --- ROUTES ---
app.get('/', (req, res) => res.send('Stock Trading API is Live!'));

// Admin Routes (Data Gen)
app.use('/api/admin', seedRoutes);

// Auth Routes (Login/Register)
app.use('/api/auth', authRoutes); // <--- NEW

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
