// backend/routes/orderRoutes.js
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

/**
 * POST /api/orders/execute
 * Handles BOTH Buying and Selling with full audit trails.
 */
router.post('/execute', async (req, res) => {
    const client = await pool.connect();
    try {
        const { userId, stockId, quantity, type } = req.body; // type: 'BUY' or 'SELL'
        const qty = Number(quantity);
        
        // Start Transaction (All or Nothing safety lock)
        await client.query('BEGIN');

        // 1. Get Wallet Balance (Lock row for update to prevent double-spending)
        const walletRes = await client.query('SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE', [userId]);
        if (walletRes.rows.length === 0) throw new Error('Wallet not found');
        const wallet = walletRes.rows[0];

        // 2. Get Current Stock Price
        const stockRes = await client.query('SELECT current_price FROM stocks WHERE stock_id = $1', [stockId]);
        if (stockRes.rows.length === 0) throw new Error('Stock not found');
        
        const price = Number(stockRes.rows[0].current_price);
        const tradeValue = price * qty;
        
        // 3. Calculate Fees (1% for Buy, 2% for Sell)
        const feePercent = type === 'BUY' ? 0.01 : 0.02;
        const feePaid = tradeValue * feePercent;

        // 4. Directional Logic (Funds Check vs Share Check)
        if (type === 'BUY') {
            const totalCost = tradeValue + feePaid;
            // ENFORCE BUYING POWER: Ensure user has enough cash for (Price + Fee)
            if (Number(wallet.balance) < totalCost) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: `Insufficient funds. Need $${totalCost.toFixed(2)} (incl. 1% fee)` });
            }
            // Deduct Total Cost from Wallet
            await client.query('UPDATE wallets SET balance = balance - $1 WHERE wallet_id = $2', [totalCost, wallet.wallet_id]);
        } else {
            // SELL LOGIC: Check if they own enough shares to fulfill order
            const holdingsRes = await client.query(
                `SELECT SUM(quantity) as current_qty FROM trades WHERE user_id = $1 AND stock_id = $2`,
                [userId, stockId]
            );
            const currentQty = Number(holdingsRes.rows[0].current_qty || 0);
            if (currentQty < qty) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: `Insufficient shares. You only own ${currentQty} shares.` });
            }
            // Add Net Proceeds to Wallet (Value - Fee)
            const netProceeds = tradeValue - feePaid;
            await client.query('UPDATE wallets SET balance = balance + $1 WHERE wallet_id = $2', [netProceeds, wallet.wallet_id]);
        }

        // 5. Create Order Record (Standard Audit Trail)
        const orderRes = await client.query(
            `INSERT INTO orders (user_id, stock_id, order_type, quantity, price_per_share, status, created_at)
             VALUES ($1, $2, $3, $4, $5, 'FILLED', NOW())
             RETURNING order_id`,
            [userId, stockId, type === 'BUY' ? 'MARKET_BUY' : 'MARKET_SELL', qty, price]
        );
        const orderId = orderRes.rows[0].order_id;

        // 6. Create Trade Record (The Receipt with Fees)
        // Note: For Sells, quantity is stored as negative to keep portfolio math simple.
        await client.query(
            `INSERT INTO trades (order_id, user_id, stock_id, quantity, price_executed, trade_value, fee_paid, executed_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
            [
                orderId, 
                userId, 
                stockId, 
                type === 'BUY' ? qty : -qty, 
                price, 
                tradeValue, 
                feePaid
            ]
        );

        // Success: Finalize the transaction
        await client.query('COMMIT');

        res.json({ 
            success: true, 
            message: `Order Executed: ${type === 'BUY' ? 'Bought' : 'Sold'} ${qty} shares!`,
            fee: feePaid
        });

    } catch (err) {
        // ERROR: Roll back every single change to keep data clean
        await client.query('ROLLBACK'); 
        console.error("Order Execution Failure:", err);
        res.status(500).json({ error: err.message });
    } finally {
        // ALWAYS release the client back to the pool
        client.release();
    }
});

module.exports = router;
