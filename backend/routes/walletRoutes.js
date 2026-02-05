const express = require('express');
const router = express.Router();
const db = require('../db'); // <--- Using Singleton connection

// GET Balance (Keep for utility)
router.get('/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const result = await db.query('SELECT balance FROM wallets WHERE user_id = $1', [userId]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Wallet not found' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST Add Funds (Restored Full Logic)
router.post('/add', async (req, res) => {
    // We access the raw pool from our singleton to get a client for transactions
    const client = await db.pool.connect();
    
    try {
        const { userId, amount } = req.body;
        const addAmount = Number(amount);

        // CONSTRAINT 1: Max add limit ($100,000)
        if (addAmount > 100000) {
            return res.status(400).json({ error: 'Cannot add more than $100,000 at once.' });
        }
        if (addAmount <= 0) {
            return res.status(400).json({ error: 'Amount must be positive.' });
        }

        await client.query('BEGIN');

        // Get Current Balance & Lock Row
        const walletRes = await client.query('SELECT wallet_id, balance FROM wallets WHERE user_id = $1 FOR UPDATE', [userId]);
        
        if (walletRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Wallet not found' });
        }

        const currentBalance = Number(walletRes.rows[0].balance);
        const walletId = walletRes.rows[0].wallet_id;

        // CONSTRAINT 2: Max Total Wallet Limit ($1,000,000)
        if (currentBalance + addAmount > 1000000) {
            await client.query('ROLLBACK');
            return res.status(400).json({ 
                error: `Deposit failed. Maximum wallet limit is $1,000,000. You can only add $${(1000000 - currentBalance).toLocaleString()}.` 
            });
        }

        // Execute Deposit
        const newBalance = currentBalance + addAmount;
        await client.query('UPDATE wallets SET balance = $1 WHERE user_id = $2', [newBalance, userId]);

        // Record Transaction (Restored Logic)
        // Note: Ensure 'wallet_transactions' table exists via SQL Tool
        await client.query(`
            INSERT INTO wallet_transactions (wallet_id, transaction_type, amount, created_at)
            VALUES ($1, 'DEPOSIT', $2, NOW())
        `, [walletId, addAmount]);

        await client.query('COMMIT');
        
        res.json({ 
            success: true, 
            newBalance: newBalance, 
            message: `$${addAmount.toLocaleString()} added successfully!` 
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Wallet Add Error:", err);
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

module.exports = router;
