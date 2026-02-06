const express = require('express');
const router = express.Router();
const db = require('../db'); // Using Singleton connection

// 1. GET Balance
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

// 2. POST Manage Funds (Add & Withdraw)
router.post('/add', async (req, res) => {
    const client = await db.pool.connect();
    
    try {
        const { userId, amount } = req.body;
        const requestedAmount = Number(amount); 
        const isWithdrawal = requestedAmount < 0;
        const absAmount = Math.abs(requestedAmount);

        // Validation: Basic Checks
        if (absAmount === 0) {
            return res.status(400).json({ error: 'Amount cannot be zero.' });
        }

        await client.query('BEGIN');

        // Get Current Balance & Lock Row to prevent double-spending
        const walletRes = await client.query('SELECT wallet_id, balance FROM wallets WHERE user_id = $1 FOR UPDATE', [userId]);
        
        if (walletRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Wallet not found' });
        }

        const currentBalance = Number(walletRes.rows[0].balance);
        const walletId = walletRes.rows[0].wallet_id;
        let newBalance = currentBalance;

        if (isWithdrawal) {
            // --- WITHDRAWAL LOGIC ---
            if (currentBalance < absAmount) {
                await client.query('ROLLBACK');
                return res.status(400).json({ 
                    error: `Insufficient funds. You only have $${currentBalance.toLocaleString()} available.` 
                });
            }
            newBalance = currentBalance - absAmount;
        } else {
            // --- DEPOSIT LOGIC ---
            if (absAmount > 100000) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Cannot add more than $100,000 at once.' });
            }
            if (currentBalance + absAmount > 1000000) {
                await client.query('ROLLBACK');
                return res.status(400).json({ 
                    error: `Max wallet limit is $1,000,000. Current: $${currentBalance.toLocaleString()}.` 
                });
            }
            newBalance = currentBalance + absAmount;
        }

        // Execute Balance Update
        await client.query('UPDATE wallets SET balance = $1 WHERE user_id = $2', [newBalance, userId]);

        // Record Transaction
        const type = isWithdrawal ? 'WITHDRAWAL' : 'DEPOSIT';
        await client.query(`
            INSERT INTO wallet_transactions (wallet_id, transaction_type, amount, created_at)
            VALUES ($1, $2, $3, NOW())
        `, [walletId, type, absAmount]);

        await client.query('COMMIT');
        
        res.json({ 
            success: true, 
            newBalance: newBalance, 
            message: `$${absAmount.toLocaleString()} ${isWithdrawal ? 'withdrawn' : 'added'} successfully!` 
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Wallet Transaction Error:", err);
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// 3. GET Wallet Transaction History
router.get('/history/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const result = await db.query(`
            SELECT wt.transaction_id, wt.transaction_type, wt.amount, wt.created_at
            FROM wallet_transactions wt
            JOIN wallets w ON wt.wallet_id = w.wallet_id
            WHERE w.user_id = $1
            ORDER BY wt.created_at DESC
        `, [userId]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
