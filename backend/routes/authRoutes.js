const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';

// REGISTER
router.post('/register', async (req, res) => {
    const client = await pool.connect();
    try {
        const { username, email, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Create User (Default is_admin = FALSE)
        const userRes = await client.query(
            `INSERT INTO users (username, email, password_hash, is_admin) 
             VALUES ($1, $2, $3, FALSE) RETURNING user_id, username, is_admin`,
            [username, email, hashedPassword]
        );
        const user = userRes.rows[0];

        // Create Wallet
        await client.query(
            'INSERT INTO wallets (user_id, balance) VALUES ($1, 10000.00)',
            [user.user_id]
        );

        res.json({ message: 'User created successfully', user });
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ error: 'Username or email already exists' });
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// LOGIN
router.post('/login', async (req, res) => {
    const client = await pool.connect();
    try {
        const { username, password } = req.body;
        
        // We now select 'is_admin' too!
        const result = await client.query('SELECT * FROM users WHERE username = $1', [username]);
        if (result.rows.length === 0) return res.status(400).json({ error: 'User not found' });

        const user = result.rows[0];
        const validPass = await bcrypt.compare(password, user.password_hash);
        if (!validPass) return res.status(400).json({ error: 'Invalid password' });

        const token = jwt.sign({ id: user.user_id, isAdmin: user.is_admin }, JWT_SECRET, { expiresIn: '1h' });

        res.json({ 
            token, 
            user: { 
                id: user.user_id, 
                username: user.username, 
                email: user.email,
                is_admin: user.is_admin // <--- CRITICAL: Sending status to frontend
            } 
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// GET ALL USERS (Admin Only)
router.get('/users', async (req, res) => {
    const client = await pool.connect();
    try {
        // Fetch is_admin status so we can show it in the table
        const result = await client.query('SELECT user_id, username, created_at, is_admin FROM users ORDER BY user_id ASC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// TOGGLE ADMIN STATUS (New Route)
router.put('/users/:id/role', async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        const { isAdmin } = req.body; // TRUE or FALSE

        await client.query('UPDATE users SET is_admin = $1 WHERE user_id = $2', [isAdmin, id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

module.exports = router;
