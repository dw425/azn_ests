const express = require('express');
const cors = require('cors');
require('dotenv').config();

// --- 1. INITIALIZE DATABASE (Fixing the Path Error) ---
// We use ./backend/db because server.js is in the ROOT folder.
const db = require('./backend/db'); 

// --- 2. IMPORT ROUTES ---
const seedRoutes = require('./backend/routes/seedRoutes'); 
const authRoutes = require('./backend/routes/authRoutes'); 
const stockRoutes = require('./backend/routes/stockRoutes'); 
const orderRoutes = require('./backend/routes/orderRoutes');
const portfolioRoutes = require('./backend/routes/portfolioRoutes');
const walletRoutes = require('./backend/routes/walletRoutes');
const adminRoutes = require('./backend/routes/adminRoutes');

// --- 3. BACKGROUND SERVICES ---
const { startEngine } = require('./utils/priceEngine'); 

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(cors());
app.use(express.json());

// --- 4. TEST DATABASE CONNECTION ON START ---
db.query('SELECT NOW()')
  .then(() => console.log('✅ Connected to Database (Singleton)'))
  .catch(err => {
      console.error('❌ DB Connection Error:', err);
      // We do NOT exit here, so the server can still attempt to restart
  });

// --- 5. REGISTER ROUTES ---
app.get('/', (req, res) => res.send('Stock Trading API is Live!'));

// Admin & System Routes
app.use('/api/admin', seedRoutes);
app.use('/api/admin', adminRoutes);

// User & Trading Routes
app.use('/api/auth', authRoutes);
app.use('/api/stocks', stockRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/wallet', walletRoutes);

// --- 6. START SERVER ---
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    
    // Start the Price Engine (Simulates market movement)
    // It runs in the background and updates prices every 10 seconds
    startEngine();
});
