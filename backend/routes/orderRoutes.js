// backend/routes/orderRoutes.js
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// POST /api/orders/buy
router.post('/buy', async (req, res) => {
    const client = await pool.connect();
    try {
        const { userId, stockId, quantity } = req.body;
        
        // Start Transaction (All or Nothing safety lock)
        await client.query('BEGIN');

        // 1. Get Wallet Balance
        const walletRes = await client.query('SELECT * FROM wallets WHERE user_id = $1', [userId]);
        if (walletRes.rows.length === 0) throw new Error('Wallet not found');
        const wallet = walletRes.rows[0];

        // 2. Get Current Stock Price
        const stockRes = await client.query('SELECT current_price FROM stocks WHERE stock_id = $1', [stockId]);
        if (stockRes.rows.length === 0) throw new Error('Stock not found');
        
        const price = Number(stockRes.rows[0].current_price);
        const totalCost = price * Number(quantity);

        // 3. Check Funds
        if (Number(wallet.balance) < totalCost) {
            // Cancel transaction immediately
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `Insufficient funds. You need $${totalCost.toFixed(2)}` });
        }

        // 4. Deduct Money from Wallet
        await client.query('UPDATE wallets SET balance = balance - $1 WHERE wallet_id = $2', [totalCost, wallet.wallet_id]);

        // 5. Create Order Record
        const orderRes = await client.query(
            `INSERT INTO orders (user_id, stock_id, order_type, quantity, price_per_share, status, created_at)
             VALUES ($1, $2, 'MARKET_BUY', $3, $4, 'FILLED', NOW())
             RETURNING order_id`,
            [userId, stockId, quantity, price]
        );
        const orderId = orderRes.rows[0].order_id;

        // 6. Create Trade Record (The Receipt)
        await client.query(
            `INSERT INTO trades (order_id, user_id, stock_id, quantity, price_executed, trade_value, executed_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
            [orderId, userId, stockId, quantity, price, totalCost]
        );

        // Success: Commit the transaction (Save changes)
        await client.query('COMMIT');

        res.json({ 
            success: true, 
            message: `Successfully bought ${quantity} shares!`, 
            newBalance: Number(wallet.balance) - totalCost 
        });

    } catch (err) {
        await client.query('ROLLBACK'); // Undo everything if error
        console.error(err);
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

module.exports = router;
