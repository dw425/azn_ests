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

// 2. HISTORICAL PRICE GENERATOR (With Volatility Support)
router.post('/generate-prices', async (req, res) => {
    const client = await db.pool.connect(); 
    try {
        const { startMonth, endMonth, year } = req.body;
        const targetYear = year || 2026;
        const sMonth = startMonth !== undefined ? startMonth : 0; // Default Jan
        const eMonth = endMonth !== undefined ? endMonth : 11; // Default Dec

        console.log(`Starting Generator for ${targetYear}...`);

        // FIX: Added 'volatility' to the SELECT query
        const stockRes = await client.query('SELECT stock_id, current_price, ticker, volatility FROM stocks');
        const stocks = stockRes.rows;

        let totalRecords = 0;
        
        for (let month = sMonth; month <= eMonth; month++) {
            const daysInMonth = new Date(targetYear, month + 1, 0).getDate();

            for (let day = 1; day <= daysInMonth; day++) {
                const date = new Date(targetYear, month, day);
                const dayOfWeek = date.getDay();
                if (dayOfWeek === 0 || dayOfWeek === 6) continue; // Skip Weekends

                let currentHour = 9; // Market Open 9:30 (Simulated start 9:00)
                let currentMinute = 30;

                const values = [];
                const placeholders = [];
                let paramIndex = 1;

                // Simulate 9:30 AM to 4:00 PM (16:00)
                while (currentHour < 16 || (currentHour === 16 && currentMinute === 0)) {
                    const timeStr = `${targetYear}-${month + 1}-${day} ${currentHour}:${currentMinute}:00`;

                    stocks.forEach(stock => {
                        const currentPrice = Number(stock.current_price);
                        const vol = Number(stock.volatility) || 0.02; // Use DB Volatility
                        
                        // FIX: Pass volatility to the math function
                        // Assuming getNextPrice(price, volatility) signature
                        const newPrice = getNextPrice(currentPrice, vol); 
                        
                        stock.current_price = newPrice; 

                        values.push(stock.stock_id, newPrice, timeStr);
                        placeholders.push(`($${paramIndex}, $${paramIndex+1}, $${paramIndex+2})`);
                        paramIndex += 3;
                    });

                    currentMinute += 30; 
                    if (currentMinute >= 60) {
                        currentMinute -= 60;
                        currentHour++;
                    }
                }

                if (placeholders.length > 0) {
                    const query = `
                        INSERT INTO stock_prices (stock_id, price, recorded_at) 
                        VALUES ${placeholders.join(',')}
                        ON CONFLICT DO NOTHING
                    `;
                    await client.query(query, values);
                    totalRecords += (values.length / 3);
                }
            }
            console.log(`Generated Month ${month + 1}`);
        }

        // Save final prices to the stocks table so the Dashboard shows the latest value
        for (const stock of stocks) {
            await client.query('UPDATE stocks SET current_price = $1 WHERE stock_id = $2', 
                [stock.current_price, stock.stock_id]);
        }

        res.json({ 
            success: true, 
            message: `Generated ${totalRecords} records.`, 
            last_status: "Volatility applied. Users created."
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
