const express = require('express');
const router = express.Router();
const db = require('../db'); // <--- SINGLETON
const { getMarketStatus } = require('../utils/marketCheck');

// BUY STOCK
router.post('/buy', async (req, res) => {
    // Check Market Status FIRST
    const marketCheck = await getMarketStatus();
    if (!marketCheck.allowed) {
        return res.status(403).json({ error: `Trade blocked — ${marketCheck.reason}` });
    }

    const { userId, stockId, quantity } = req.body;
    const client = await db.pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Get Wallet
        const walletRes = await client.query('SELECT * FROM wallets WHERE user_id = $1', [userId]);
        const wallet = walletRes.rows[0];

        // 2. Get Stock Price + Volume
        const stockRes = await client.query('SELECT current_price, volume, ticker FROM stocks WHERE stock_id = $1', [stockId]);
        const stock = stockRes.rows[0];

        if (!wallet || !stock) throw new Error('Invalid user or stock');

        const totalCost = Number(stock.current_price) * Number(quantity);

        if (Number(wallet.balance) < totalCost) {
            throw new Error('Insufficient funds');
        }

        // Volume Check: total shares owned by ALL users for this stock can't exceed volume
        if (stock.volume && Number(stock.volume) > 0) {
            const totalHeldRes = await client.query(
                'SELECT COALESCE(SUM(quantity), 0) as total_held FROM holdings WHERE stock_id = $1',
                [stockId]
            );
            const totalHeld = Number(totalHeldRes.rows[0].total_held);
            if (totalHeld + Number(quantity) > Number(stock.volume)) {
                throw new Error(`Exceeds available volume — only ${(Number(stock.volume) - totalHeld).toLocaleString()} shares of ${stock.ticker} remaining`);
            }
        }

        // 3. Deduct Balance
        await client.query('UPDATE wallets SET balance = balance - $1 WHERE user_id = $2', [totalCost, userId]);

        // 4. Add/Update Holding
        const holdingRes = await client.query(
            'SELECT * FROM holdings WHERE user_id = $1 AND stock_id = $2',
            [userId, stockId]
        );

        if (holdingRes.rows.length > 0) {
            await client.query(
                'UPDATE holdings SET quantity = quantity + $1, average_buy_price = (($2::numeric * $3::numeric) + (average_buy_price * quantity)) / (quantity + $1) WHERE user_id = $4 AND stock_id = $5',
                [quantity, stock.current_price, quantity, userId, stockId]
            );
        } else {
            await client.query(
                'INSERT INTO holdings (user_id, stock_id, quantity, average_buy_price) VALUES ($1, $2, $3, $4)',
                [userId, stockId, quantity, stock.current_price]
            );
        }

        // 5. Log Transaction
        await client.query(
            'INSERT INTO transactions (user_id, stock_id, order_type, quantity, price_executed, total_amount) VALUES ($1, $2, $3, $4, $5, $6)',
            [userId, stockId, 'BUY', quantity, stock.current_price, totalCost]
        );

        await client.query('COMMIT');
        res.json({ message: 'Buy successful' });

    } catch (err) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: err.message });
    } finally {
        client.release();
    }
});

// SELL STOCK
router.post('/sell', async (req, res) => {
    // Check Market Status FIRST
    const marketCheck = await getMarketStatus();
    if (!marketCheck.allowed) {
        return res.status(403).json({ error: `Trade blocked — ${marketCheck.reason}` });
    }

    const { userId, stockId, quantity } = req.body;
    const client = await db.pool.connect();

    try {
        await client.query('BEGIN');

        const stockRes = await client.query('SELECT current_price FROM stocks WHERE stock_id = $1', [stockId]);
        const stock = stockRes.rows[0];

        const holdingRes = await client.query('SELECT * FROM holdings WHERE user_id = $1 AND stock_id = $2', [userId, stockId]);
        const holding = holdingRes.rows[0];

        if (!holding || holding.quantity < quantity) {
            throw new Error('Insufficient shares');
        }

        const totalValue = Number(stock.current_price) * Number(quantity);

        // 1. Add Balance
        await client.query('UPDATE wallets SET balance = balance + $1 WHERE user_id = $2', [totalValue, userId]);

        // 2. Reduce Holding
        if (Number(holding.quantity) === Number(quantity)) {
            await client.query('DELETE FROM holdings WHERE user_id = $1 AND stock_id = $2', [userId, stockId]);
        } else {
            await client.query('UPDATE holdings SET quantity = quantity - $1 WHERE user_id = $2 AND stock_id = $3', [quantity, userId, stockId]);
        }

        // 3. Log Transaction
        await client.query(
            'INSERT INTO transactions (user_id, stock_id, order_type, quantity, price_executed, total_amount) VALUES ($1, $2, $3, $4, $5, $6)',
            [userId, stockId, 'SELL', quantity, stock.current_price, totalValue]
        );

        await client.query('COMMIT');
        res.json({ message: 'Sell successful' });

    } catch (err) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: err.message });
    } finally {
        client.release();
    }
});

// DIAGNOSTIC: Test buy check (GET request you can hit from browser)
// Usage: /api/orders/test-buy?userId=2&stockId=8&quantity=1
router.get('/test-buy', async (req, res) => {
    try {
        const { userId, stockId, quantity } = req.query;
        
        // 1. Market Check
        const marketCheck = await getMarketStatus();
        if (!marketCheck.allowed) {
            return res.json({ step: 'MARKET_CHECK', error: marketCheck.reason, marketCheck });
        }

        // 2. Wallet Check
        const walletRes = await db.query('SELECT balance FROM wallets WHERE user_id = $1', [userId]);
        if (walletRes.rows.length === 0) return res.json({ step: 'WALLET', error: 'Wallet not found' });
        const balance = Number(walletRes.rows[0].balance);

        // 3. Stock Check
        const stockRes = await db.query('SELECT current_price, ticker, volume FROM stocks WHERE stock_id = $1', [stockId]);
        if (stockRes.rows.length === 0) return res.json({ step: 'STOCK', error: 'Stock not found' });
        const price = Number(stockRes.rows[0].current_price);
        const cost = price * Number(quantity);
        const stockVolume = Number(stockRes.rows[0].volume) || 0;

        // 4. Funds Check
        if (balance < cost) return res.json({ step: 'FUNDS', error: `Need ${cost} but only have ${balance}` });

        // 5. Volume Check
        if (stockVolume > 0) {
            const totalHeldRes = await db.query('SELECT COALESCE(SUM(quantity), 0) as total_held FROM holdings WHERE stock_id = $1', [stockId]);
            const totalHeld = Number(totalHeldRes.rows[0].total_held);
            if (totalHeld + Number(quantity) > stockVolume) {
                return res.json({ step: 'VOLUME', error: `Exceeds volume — only ${stockVolume - totalHeld} shares remaining of ${stockVolume} total` });
            }
        }

        res.json({ 
            step: 'ALL_PASSED', 
            message: 'Buy would succeed',
            ticker: stockRes.rows[0].ticker,
            price, quantity: Number(quantity), cost, balance,
            remaining: balance - cost,
            volume: stockVolume,
            marketCheck
        });
    } catch (err) {
        res.json({ step: 'ERROR', error: err.message });
    }
});

// HISTORY
router.get('/history/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const result = await db.query(`
            SELECT t.*, s.ticker 
            FROM transactions t 
            JOIN stocks s ON t.stock_id = s.stock_id 
            WHERE t.user_id = $1 
            ORDER BY t.created_at DESC
        `, [userId]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
