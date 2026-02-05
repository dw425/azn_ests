const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { validateRegistration } = require('../utils/security'); // Import Validator

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';

// --- EXISTING AUTH ENDPOINTS ---

// REGISTER (SECURED)
router.post('/register', async (req, res) => {
    const client = await pool.connect();
    try {
        // 1. Sanitize Inputs (Trim whitespace)
        const username = req.body.username ? req.body.username.trim() : '';
        const email = req.body.email ? req.body.email.toLowerCase().trim() : '';
        const password = req.body.password || '';

        // 2. Validate Inputs
        const validationErrors = validateRegistration(username, email, password);
        if (validationErrors.length > 0) {
            return res.status(400).json({ error: validationErrors.join(' ') });
        }

        // 3. Check for Duplicates
        const checkRes = await client.query(
            'SELECT user_id FROM users WHERE username = $1 OR email = $2', 
            [username, email]
        );
        
        if (checkRes.rows.length > 0) {
            return res.status(400).json({ error: 'Username or Email already exists.' });
        }

        // 4. Encrypt Password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // 5. Create User
        const userRes = await client.query(
            `INSERT INTO users (username, email, password_hash, is_admin) 
             VALUES ($1, $2, $3, FALSE) RETURNING user_id, username, is_admin`,
            [username, email, hashedPassword]
        );
        const user = userRes.rows[0];

        // 6. Create Initial Wallet
        await client.query(
            'INSERT INTO wallets (user_id, balance) VALUES ($1, 10000.00)',
            [user.user_id]
        );

        res.json({ message: 'User created successfully', user });

    } catch (err) {
        console.error("Registration Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    } finally {
        client.release();
    }
});

// LOGIN
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const client = await pool.connect();
    
    try {
        const result = await client.query('SELECT * FROM users WHERE username = $1', [username.trim()]);
        const user = result.rows[0];

        if (!user) return res.status(400).json({ error: 'User not found' });

        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) return res.status(400).json({ error: 'Invalid password' });

        const token = jwt.sign({ id: user.user_id, username: user.username, is_admin: user.is_admin }, JWT_SECRET, { expiresIn: '1h' });

        res.json({ token, user: { id: user.user_id, username: user.username, is_admin: user.is_admin } });
    } catch (err) {
        console.error("Login Error:", err);
        res.status(500).json({ error: "Server error" });
    } finally {
        client.release();
    }
});

// --- NEW USER MANAGEMENT ENDPOINTS (For Admin Dashboard) ---

// GET All Users
router.get('/users', async (req, res) => {
    try {
        // Fetch all users to display in the Admin Dashboard list
        const result = await pool.query('SELECT user_id, username, email, is_admin, created_at FROM users ORDER BY user_id ASC');
        res.json(result.rows);
    } catch (err) {
        console.error("Get Users Error:", err);
        res.status(500).send('Server Error');
    }
});

// UPDATE User Role (Toggle Admin)
router.put('/users/:id/role', async (req, res) => {
    try {
        const { id } = req.params;
        const { isAdmin } = req.body; // Boolean value sent from frontend
        
        const result = await pool.query(
            'UPDATE users SET is_admin = $1 WHERE user_id = $2 RETURNING user_id, username, is_admin',
            [isAdmin, id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "User not found" });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error("Update Role Error:", err);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
