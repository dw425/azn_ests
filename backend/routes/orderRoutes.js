const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// --- BUY STOCK ---
router.post('/buy', async (req, res) => {
    const { userId, stockId, quantity } = req.body;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Get Stock Price
        const stockRes = await client.query('SELECT current_price FROM stocks WHERE stock_id = $1', [stockId]);
        if (stockRes.rows.length === 0) throw new Error('Stock not found');
        const price = parseFloat(stockRes.rows[0].current_price);
        const totalCost = price * quantity;

        // 2. Check Wallet Balance
        const walletRes = await client.query('SELECT balance FROM wallets WHERE user_id = $1 FOR UPDATE', [userId]);
        if (walletRes.rows.length === 0) throw new Error('Wallet not found');
        const balance = parseFloat(walletRes.rows[0].balance);

        if (balance < totalCost) {
            throw new Error(`Insufficient funds. Cost: $${totalCost}, Balance: $${balance}`);
        }

        // 3. Deduct Cash
        await client.query('UPDATE wallets SET balance = balance - $1 WHERE user_id = $2', [totalCost, userId]);

        // 4. Update/Create Portfolio Position
        const portfolioRes = await client.query(
            'SELECT quantity FROM portfolios WHERE user_id = $1 AND stock_id = $2',
            [userId, stockId]
        );

        if (portfolioRes.rows.length > 0) {
            await client.query(
                'UPDATE portfolios SET quantity = quantity + $1 WHERE user_id = $2 AND stock_id = $3',
                [quantity, userId, stockId]
            );
        } else {
            await client.query(
                'INSERT INTO portfolios (user_id, stock_id, quantity) VALUES ($1, $2, $3)',
                [userId, stockId, quantity]
            );
        }

        // 5. Record Order (Ledger)
        await client.query(
            'INSERT INTO orders (user_id, stock_id, order_type, quantity, price_executed) VALUES ($1, $2, $3, $4, $5)',
            [userId, stockId, 'BUY', quantity, price]
        );

        await client.query('COMMIT');
        res.json({ message: 'Buy successful', price, totalCost });

    } catch (err) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: err.message });
    } finally {
        client.release();
    }
});

// --- SELL STOCK ---
router.post('/sell', async (req, res) => {
    const { userId, stockId, quantity } = req.body;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Get Stock Price
        const stockRes = await client.query('SELECT current_price FROM stocks WHERE stock_id = $1', [stockId]);
        if (stockRes.rows.length === 0) throw new Error('Stock not found');
        const price = parseFloat(stockRes.rows[0].current_price);
        const totalValue = price * quantity;

        // 2. Check Portfolio Ownership
        const portRes = await client.query(
            'SELECT quantity FROM portfolios WHERE user_id = $1 AND stock_id = $2 FOR UPDATE',
            [userId, stockId]
        );

        if (portRes.rows.length === 0 || portRes.rows[0].quantity < quantity) {
            throw new Error('Insufficient shares to sell');
        }

        // 3. Remove Shares
        const newQuantity = portRes.rows[0].quantity - quantity;
        if (newQuantity === 0) {
            await client.query('DELETE FROM portfolios WHERE user_id = $1 AND stock_id = $2', [userId, stockId]);
        } else {
            await client.query('UPDATE portfolios SET quantity = $1 WHERE user_id = $2 AND stock_id = $3', [newQuantity, userId, stockId]);
        }

        // 4. Add Cash
        await client.query('UPDATE wallets SET balance = balance + $1 WHERE user_id = $2', [totalValue, userId]);

        // 5. Record Order (Ledger)
        await client.query(
            'INSERT INTO orders (user_id, stock_id, order_type, quantity, price_executed) VALUES ($1, $2, $3, $4, $5)',
            [userId, stockId, 'SELL', quantity, price]
        );

        await client.query('COMMIT');
        res.json({ message: 'Sell successful', price, totalValue });

    } catch (err) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: err.message });
    } finally {
        client.release();
    }
});

// --- GET TRANSACTION HISTORY (NEW!) ---
router.get('/history/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        // We JOIN with stocks to get the Ticker symbol
        // We limit to 50 for performance (Pagination logic in Phase 2)
        const result = await pool.query(`
            SELECT 
                o.order_id, 
                o.order_type, 
                o.quantity, 
                o.price_executed, 
                (o.quantity * o.price_executed) as total_amount, 
                o.created_at, 
                s.ticker,
                s.company_name
            FROM orders o
            JOIN stocks s ON o.stock_id = s.stock_id
            WHERE o.user_id = $1
            ORDER BY o.created_at DESC
            LIMIT 50
        `, [userId]);

        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

module.exports = router;
