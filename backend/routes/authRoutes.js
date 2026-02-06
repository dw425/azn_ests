const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db'); // <--- SINGLETON CONNECTION
const { validateRegistration } = require('../utils/security');

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';

// REGISTER
router.post('/register', async (req, res) => {
    // Note: For transactions, we still grab a specific client from the pool
    const client = await db.pool.connect(); 
    try {
        await client.query('BEGIN');

        const username = req.body.username ? req.body.username.trim() : '';
        const email = req.body.email ? req.body.email.toLowerCase().trim() : '';
        const password = req.body.password || '';
        const full_name = req.body.full_name ? req.body.full_name.trim() : '';

        const validationErrors = validateRegistration(username, email, password);
        if (validationErrors.length > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: validationErrors.join(' ') });
        }

        const checkRes = await client.query(
            'SELECT user_id FROM users WHERE username = $1 OR email = $2', 
            [username, email]
        );
        
        if (checkRes.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Username or Email already exists.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        
        const userRes = await client.query(
            `INSERT INTO users (username, email, password_hash, is_admin, full_name) 
             VALUES ($1, $2, $3, FALSE, $4) RETURNING user_id, username, is_admin, full_name`,
            [username, email, hashedPassword, full_name]
        );
        const user = userRes.rows[0];

        // Create Wallet
        await client.query(
            'INSERT INTO wallets (user_id, balance) VALUES ($1, 10000.00)',
            [user.user_id]
        );

        await client.query('COMMIT');
        res.json({ message: 'User created successfully', user });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Registration Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    } finally {
        client.release();
    }
});

// LOGIN
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    
    try {
        const result = await db.query('SELECT * FROM users WHERE username = $1', [username.trim()]);
        const user = result.rows[0];

        if (!user) return res.status(400).json({ error: 'User not found' });

        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) return res.status(400).json({ error: 'Invalid password' });

        const token = jwt.sign({ id: user.user_id, username: user.username, is_admin: user.is_admin }, JWT_SECRET, { expiresIn: '1h' });

        res.json({ token, user: { id: user.user_id, username: user.username, is_admin: user.is_admin, full_name: user.full_name || '' } });
    } catch (err) {
        console.error("Login Error:", err);
        res.status(500).json({ error: "Server error" });
    }
});

// GET USERS (Admin)
router.get('/users', async (req, res) => {
    try {
        const result = await db.query('SELECT user_id, username, email, is_admin, full_name, created_at FROM users ORDER BY user_id ASC');
        res.json(result.rows);
    } catch (err) {
        console.error("Get Users Error:", err);
        res.status(500).send('Server Error');
    }
});

// TOGGLE ROLE (Admin)
router.put('/users/:id/role', async (req, res) => {
    try {
        const { id } = req.params;
        const { isAdmin } = req.body; 
        
        const result = await db.query(
            'UPDATE users SET is_admin = $1 WHERE user_id = $2 RETURNING user_id, username, is_admin',
            [isAdmin, id]
        );
        
        if (result.rows.length === 0) return res.status(404).json({ error: "User not found" });
        res.json(result.rows[0]);
    } catch (err) {
        console.error("Update Role Error:", err);
        res.status(500).send('Server Error');
    }
});

// DELETE USER (Admin) — removes user and all related data
router.delete('/users/:id', async (req, res) => {
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        const { id } = req.params;

        // Delete in order of dependencies
        await client.query('DELETE FROM transactions WHERE user_id = $1', [id]);
        await client.query('DELETE FROM holdings WHERE user_id = $1', [id]);
        await client.query('DELETE FROM wallet_transactions WHERE wallet_id IN (SELECT wallet_id FROM wallets WHERE user_id = $1)', [id]);
        await client.query('DELETE FROM wallets WHERE user_id = $1', [id]);
        await client.query('DELETE FROM users WHERE user_id = $1', [id]);

        await client.query('COMMIT');
        res.json({ message: 'User deleted successfully' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Delete User Error:", err);
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

module.exports = router;
