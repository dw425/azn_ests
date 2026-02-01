const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

// --- IMPORT ROUTES ---
// Note: These paths must match your folder structure exactly
const seedRoutes = require('./backend/routes/seedRoutes'); 
const authRoutes = require('./backend/routes/authRoutes'); 
const stockRoutes = require('./backend/routes/stockRoutes'); 
const orderRoutes = require('./backend/routes/orderRoutes');
const portfolioRoutes = require('./backend/routes/portfolioRoutes');
const walletRoutes = require('./backend/routes/walletRoutes');
const adminRoutes = require('./backend/routes/adminRoutes');

// --- IMPORT PRICE ENGINE ---
// This handles the automatic price fluctuation
const { startEngine } = require('./utils/priceEngine'); 

const app = express();
const PORT = process.env.PORT || 10000;

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json()); // <--- CRITICAL: This allows the Admin Toggle to work

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

pool.connect()
    .then(() => console.log('✅ Connected to Database'))
    .catch(err => console.error('❌ DB Connection Error:', err));

// --- ROUTES ---
app.get('/', (req, res) => res.send('Stock Trading API is Live!'));

// Admin & Seed Routes
// These both share /api/admin but handle different sub-paths (e.g., /seed vs /settings)
app.use('/api/admin', seedRoutes);
app.use('/api/admin', adminRoutes);

// App Routes
app.use('/api/auth', authRoutes);
app.use('/api/stocks', stockRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/wallet', walletRoutes);

// --- START SERVER & ENGINE ---
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    
    // Start the background price generator
    startEngine();
});
