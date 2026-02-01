// backend/routes/orderRoutes.js
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// --- HELPER: Check Market Status ---
const checkMarketStatus = async (res) => {
  try {
    const result = await pool.query('SELECT market_status FROM system_settings WHERE id = 1');
    if (result.rows.length > 0 && result.rows[0].market_status === 'CLOSED') {
      res.status(403).json({ error: '⛔ Market is currently CLOSED by the Administrator.' });
      return false; // Market is closed
    }
    return true; // Market is open
  } catch (err) {
    console.error("Market Check Error:", err);
    // If table missing (first run), allow trade
    return true; 
  }
};

// 1. BUY STOCK
router.post('/buy', async (req, res) => {
  // STEP 1: Check Market Hours
  const isOpen = await checkMarketStatus(res);
  if (!isOpen) return;

  const client = await pool.connect();
  try {
    const { user_id, stock_id, quantity } = req.body;
    
    await client.query('BEGIN');

    // A. Check Wallet Balance
    const walletRes = await client.query('SELECT * FROM wallets WHERE user_id = $1', [user_id]);
    if (walletRes.rows.length === 0) throw new Error('Wallet not found');
    const wallet = walletRes.rows[0];

    // B. Get Current Stock Price
    const stockRes = await client.query('SELECT current_price FROM stocks WHERE stock_id = $1', [stock_id]);
    if (stockRes.rows.length === 0) throw new Error('Stock not found');
    const price = Number(stockRes.rows[0].current_price);
    const totalCost = price * Number(quantity);

    // C. Check Funds
    if (Number(wallet.balance) < totalCost) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Insufficient funds. Cost: $${totalCost.toFixed(2)}` });
    }

    // D. Deduct Money
    await client.query('UPDATE wallets SET balance = balance - $1 WHERE wallet_id = $2', [totalCost, wallet.wallet_id]);

    // E. Record Order
    await client.query(
      `INSERT INTO orders (user_id, stock_id, order_type, quantity, price_per_share, status, created_at) 
       VALUES ($1, $2, 'BUY', $3, $4, 'COMPLETED', NOW())`,
      [user_id, stock_id, quantity, price]
    );

    await client.query('COMMIT');
    res.json({ message: 'Buy Order Executed!', newBalance: Number(wallet.balance) - totalCost });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Transaction Failed' });
  } finally {
    client.release();
  }
});

// 2. SELL STOCK (New Feature!)
router.post('/sell', async (req, res) => {
  // STEP 1: Check Market Hours
  const isOpen = await checkMarketStatus(res);
  if (!isOpen) return;

  const client = await pool.connect();
  try {
    const { user_id, stock_id, quantity } = req.body;
    
    await client.query('BEGIN');

    // A. Verify User Has the Stock (Simple Check)
    // In a real app, we would query a 'portfolio' table. 
    // Here we sum their previous orders to see if they own enough.
    const portfolioRes = await client.query(`
      SELECT 
        SUM(CASE WHEN order_type = 'BUY' THEN quantity ELSE -quantity END) as net_qty 
      FROM orders 
      WHERE user_id = $1 AND stock_id = $2
    `, [user_id, stock_id]);

    const currentQty = portfolioRes.rows[0].net_qty || 0;
    
    if (Number(currentQty) < Number(quantity)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Not enough shares. You have ${currentQty}.` });
    }

    // B. Get Price
    const stockRes = await client.query('SELECT current_price FROM stocks WHERE stock_id = $1', [stock_id]);
    const price = Number(stockRes.rows[0].current_price);
    const totalValue = price * Number(quantity);

    // C. Add Money to Wallet
    await client.query('UPDATE wallets SET balance = balance + $1 WHERE user_id = $2', [totalValue, user_id]);

    // D. Record Order (SELL)
    await client.query(
      `INSERT INTO orders (user_id, stock_id, order_type, quantity, price_per_share, status, created_at) 
       VALUES ($1, $2, 'SELL', $3, $4, 'COMPLETED', NOW())`,
      [user_id, stock_id, quantity, price]
    );

    await client.query('COMMIT');
    res.json({ message: 'Sell Order Executed!', saleValue: totalValue });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Transaction Failed' });
  } finally {
    client.release();
  }
});

module.exports = router;
