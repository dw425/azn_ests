const express = require('express');
const router = express.Router();
const db = require('../db'); // Singleton DB
const { getNextPrice } = require('../utils/stockMath'); 

// 1. BASIC SEED (Reset Tables & Defaults + DUMMY USERS)
router.post('/seed', async (req, res) => {
    try {
        console.log("🌱 Seeding Database...");

        // 1. Create All Tables
        await db.query(`
            CREATE TABLE IF NOT EXISTS users (
                user_id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                is_admin BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS wallets (
                wallet_id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
                balance DECIMAL(15, 2) DEFAULT 10000.00,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS stocks (
                stock_id SERIAL PRIMARY KEY,
                ticker VARCHAR(10) UNIQUE NOT NULL,
                name VARCHAR(100) NOT NULL,
                sector VARCHAR(50),
                volatility DECIMAL(5,4) DEFAULT 0.02,
                base_price DECIMAL(10, 2) NOT NULL,
                current_price DECIMAL(10, 2) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS stock_prices (
                id SERIAL PRIMARY KEY,
                stock_id INTEGER REFERENCES stocks(stock_id) ON DELETE CASCADE,
                price DECIMAL(10, 2) NOT NULL,
                recorded_at TIMESTAMP NOT NULL,
                UNIQUE(stock_id, recorded_at)
            );
            CREATE TABLE IF NOT EXISTS holdings (
                holding_id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
                stock_id INTEGER REFERENCES stocks(stock_id) ON DELETE CASCADE,
                quantity INTEGER NOT NULL,
                average_buy_price DECIMAL(10, 2) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS transactions (
                transaction_id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
                stock_id INTEGER REFERENCES stocks(stock_id),
                order_type VARCHAR(10) NOT NULL,
                quantity INTEGER NOT NULL,
                price_executed DECIMAL(10, 2) NOT NULL,
                total_amount DECIMAL(15, 2) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS system_settings (
                id SERIAL PRIMARY KEY,
                market_status VARCHAR(20) DEFAULT 'OPEN',
                simulated_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS wallet_transactions (
                id SERIAL PRIMARY KEY,
                wallet_id INTEGER REFERENCES wallets(wallet_id),
                transaction_type VARCHAR(50),
                amount DECIMAL(15, 2),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            INSERT INTO system_settings (id, market_status) VALUES (1, 'OPEN') ON CONFLICT (id) DO NOTHING;
        `);

        // 2. Reset & Seed Stocks
        await db.query('TRUNCATE TABLE stocks RESTART IDENTITY CASCADE');
        const stocks = [
            { ticker: 'AAPL', name: 'Apple Inc.', price: 150.00, sector: 'Tech', vol: 0.03 },
            { ticker: 'GOOGL', name: 'Alphabet Inc.', price: 2800.00, sector: 'Tech', vol: 0.03 },
            { ticker: 'TSLA', name: 'Tesla Inc.', price: 700.00, sector: 'Auto', vol: 0.08 },
            { ticker: 'AMZN', name: 'Amazon.com', price: 3300.00, sector: 'Tech', vol: 0.04 },
            { ticker: 'MSFT', name: 'Microsoft Corp', price: 290.00, sector: 'Tech', vol: 0.02 },
            { ticker: 'JPM', name: 'JPMorgan Chase', price: 160.00, sector: 'Finance', vol: 0.02 },
            { ticker: 'COIN', name: 'Coinbase', price: 250.00, sector: 'Crypto', vol: 0.15 }, // High Volatility
            { ticker: 'GME', name: 'GameStop', price: 20.00, sector: 'Retail', vol: 0.20 }     // Extreme Volatility
        ];

        for (const s of stocks) {
            await db.query(
                'INSERT INTO stocks (ticker, name, base_price, current_price, sector, volatility) VALUES ($1, $2, $3, $3, $4, $5)',
                [s.ticker, s.name, s.price, s.sector, s.vol]
            );
        }

        // 3. Create Dummy Users (The Fix)
        // We use ON CONFLICT to ensure we don't duplicate them if you run seed twice
        const dummyUsers = [
            { name: 'MarketWhale', email: 'whale@sim.com', role: false },
            { name: 'RiskTaker', email: 'yolo@sim.com', role: false },
            { name: 'AdminUser', email: 'admin@sim.com', role: true }
        ];

        for (const u of dummyUsers) {
            // Password is 'password' (hashed placeholder)
            await db.query(`
                INSERT INTO users (username, email, password_hash, is_admin)
                VALUES ($1, $2, 'scrypt:placeholder_hash', $3)
                ON CONFLICT (username) DO NOTHING
            `, [u.name, u.email, u.role]);
        }

        // Give them money
        await db.query("UPDATE wallets SET balance = 500000.00 WHERE user_id IN (SELECT user_id FROM users WHERE username = 'MarketWhale')");

        res.json({ message: "Database Seeded! Stocks & Dummy Users created." });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// 2. HISTORICAL PRICE BACKFILL (1 Year of EOD Close Prices)
// Generates one end-of-day close price per trading day per stock
// Walks backwards from current_price using each stock's volatility
router.post('/generate-prices', async (req, res) => {
    const client = await db.pool.connect(); 
    try {
        const { days } = req.body;
        const backfillDays = days || 365;

        console.log(`Starting ${backfillDays}-day EOD backfill from current prices...`);

        // Get all stocks with current prices and volatility
        const stockRes = await client.query('SELECT stock_id, current_price, ticker, volatility FROM stocks');
        const stocks = stockRes.rows;

        // Clear old stock_prices to start fresh
        await client.query('TRUNCATE TABLE stock_prices RESTART IDENTITY');

        let totalRecords = 0;
        const now = new Date();

        // For each stock, walk BACKWARDS from current_price
        for (const stock of stocks) {
            let price = Number(stock.current_price);
            const vol = Number(stock.volatility) || 0.02;
            const pricePoints = [];

            // Walk backwards day by day
            for (let d = backfillDays; d >= 1; d--) {
                const date = new Date(now);
                date.setDate(date.getDate() - d);

                // Skip weekends
                const dayOfWeek = date.getDay();
                if (dayOfWeek === 0 || dayOfWeek === 6) continue;

                // Random walk using volatility (daily EOD swing)
                const change = (Math.random() * vol * 2) - vol;
                price = Math.max(0.01, price * (1 + change));

                // Set timestamp to 4:00 PM (market close) on that day
                const closeTime = new Date(date);
                closeTime.setHours(16, 0, 0, 0);

                pricePoints.push({ 
                    stockId: stock.stock_id, 
                    price: parseFloat(price.toFixed(2)), 
                    timestamp: closeTime.toISOString() 
                });
            }

            // Batch insert for this stock (chunk to avoid param limits)
            const CHUNK_SIZE = 500;
            for (let i = 0; i < pricePoints.length; i += CHUNK_SIZE) {
                const chunk = pricePoints.slice(i, i + CHUNK_SIZE);
                const values = [];
                const placeholders = [];
                let paramIndex = 1;

                for (const point of chunk) {
                    values.push(point.stockId, point.price, point.timestamp);
                    placeholders.push(`($${paramIndex}, $${paramIndex+1}, $${paramIndex+2})`);
                    paramIndex += 3;
                }

                await client.query(
                    `INSERT INTO stock_prices (stock_id, price, recorded_at) VALUES ${placeholders.join(',')} ON CONFLICT DO NOTHING`,
                    values
                );
            }

            totalRecords += pricePoints.length;
            console.log(`  ✅ ${stock.ticker}: ${pricePoints.length} EOD close prices`);
        }

        // Reset daily tracking to current prices (clean baseline)
        await client.query(`
            UPDATE stocks SET 
                daily_open = current_price, 
                day_high = current_price, 
                day_low = current_price
        `);

        res.json({ 
            success: true, 
            message: `Backfilled ${totalRecords} EOD records across ${stocks.length} stocks (${backfillDays} days).`
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

router.post('/run-sql', async (req, res) => {
    const client = await db.pool.connect();
    try {
        const { query } = req.body;
        const result = await client.query(query);
        res.json({ success: true, rowCount: result.rowCount, rows: result.rows });
    } catch (err) { res.status(400).json({ error: err.message }); } finally { client.release(); }
});

module.exports = router;
