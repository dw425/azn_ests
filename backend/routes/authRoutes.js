// backend/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Secret key for tokens (In a real app, this goes in .env, but this is fine for training)
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-training-key-2026';

// --- REGISTER ROUTE ---
router.post('/register', async (req, res) => {
    const client = await pool.connect();
    try {
        const { username, email, password } = req.body;

        // 1. Check if user already exists
        const check = await client.query('SELECT * FROM users WHERE email = $1 OR username = $2', [email, username]);
        if (check.rows.length > 0) {
            return res.status(400).json({ error: 'User already exists' });
        }

        // 2. Hash the password (Security Best Practice)
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // 3. Insert User
        const result = await client.query(
            `INSERT INTO users (username, email, password_hash, role, is_active) 
             VALUES ($1, $2, $3, 'CUSTOMER', true) 
             RETURNING id, username, role`,
            [username, email, passwordHash]
        );
        const newUser = result.rows[0];

        // 4. Create their Wallet with $10,000 start money
        await client.query(
            `INSERT INTO wallets (user_id, balance) VALUES ($1, 10000.00)`,
            [newUser.id]
        );

        res.status(201).json({ message: 'User created successfully', user: newUser });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error during registration: ' + err.message });
    } finally {
        client.release();
    }
});

// --- LOGIN ROUTE ---
router.post('/login', async (req, res) => {
    const client = await pool.connect();
    try {
        const { username, password } = req.body;

        // 1. Find user
        const result = await client.query('SELECT * FROM users WHERE username = $1', [username]);
        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        const user = result.rows[0];

        // 2. Check Password
        const validPass = await bcrypt.compare(password, user.password_hash);
        if (!validPass) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        // 3. Generate Token (This is their "ID Card" for the session)
        const token = jwt.sign(
            { id: user.id, role: user.role },
            JWT_SECRET,
            { expiresIn: '1h' }
        );

        res.json({ 
            message: 'Login successful',
            token, 
            user: { id: user.id, username: user.username, role: user.role }
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error during login' });
    } finally {
        client.release();
    }
});

module.exports = router;
