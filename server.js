const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

// --- IMPORT ROUTES ---
const seedRoutes = require('./backend/routes/seedRoutes'); 
const authRoutes = require('./backend/routes/authRoutes'); 
const stockRoutes = require('./backend/routes/stockRoutes'); 
const orderRoutes = require('./backend/routes/orderRoutes');
const portfolioRoutes = require('./backend/routes/portfolioRoutes');
const walletRoutes = require('./backend/routes/walletRoutes');
const adminRoutes = require('./backend/routes/adminRoutes'); // New Admin Route

// --- IMPORT PRICE ENGINE ---
const { startEngine } = require('./utils/priceEngine'); 

const app = express();
const PORT = process.env.PORT || 10000;

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json());

// --- DATABASE CONNECTION CHECK ---
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

pool.connect()
    .then(() => console.log('✅ Connected to Database'))
    .catch(err => console.error('❌ DB Connection Error:', err));

// --- API ROUTES ---
app.get('/api/health', (req, res) => res.send('Stock Trading API is Live!'));

// Admin Routes (Seed & Settings)
app.use('/api/admin', seedRoutes);
app.use('/api/admin', adminRoutes);

// App Routes
app.use('/api/auth', authRoutes);
app.use('/api/stocks', stockRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/wallet', walletRoutes);

// --- FRONTEND SERVING (WEB INTERFACE) ---
// This enables the "Web Only" access by serving the React build
app.use(express.static(path.join(__dirname, 'frontend/dist')));

// Catch-all: Send any other request to the React App
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/dist', 'index.html'));
});

// --- START SERVER & ENGINE ---
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    
    // Start the background price generator
    console.log('🚀 Starting Price Engine...');
    startEngine();
});
