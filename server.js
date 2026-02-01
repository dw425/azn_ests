const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

// --- IMPORT ROUTES ---
const seedRoutes = require('./backend/routes/seedRoutes'); 
const authRoutes = require('./backend/routes/authRoutes'); 
const stockRoutes = require('./backend/routes/stockRoutes'); 
const orderRoutes = require('./backend/routes/orderRoutes');
const portfolioRoutes = require('./backend/routes/portfolioRoutes'); // <--- NEW
const walletRoutes = require('./backend/routes/walletRoutes');


const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

pool.connect()
    .then(() => console.log('✅ Connected to Database'))
    .catch(err => console.error('❌ DB Connection Error:', err));

// --- ROUTES ---
app.get('/', (req, res) => res.send('Stock Trading API is Live!'));

app.use('/api/admin', seedRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/stocks', stockRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/portfolio', portfolioRoutes); // <--- NEW
app.use('/api/wallet', walletRoutes);



app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
