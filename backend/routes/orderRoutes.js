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
    // FIX 1: Accept both snake_case (DB standard) and camelCase (React standard)
    const { user_id, userId, stock_id, stockId, quantity } = req.body;
    
    // Normalize inputs to the ones we use in queries
    const finalUserId = user_id || userId;
    const finalStockId = stock_id || stockId;

    // FIX 2: Validate Data before crashing
    if (!finalUserId || !finalStockId || !quantity) {
        return res.status(400).json({ error: `Missing Data. Received User: ${finalUserId}, Stock: ${finalStockId}` });
    }
    
    await client.query('BEGIN');

    // A. Check Wallet Balance
    const walletRes = await client.query('SELECT * FROM wallets WHERE user_id = $1', [finalUserId]);
    if (walletRes.rows.length === 0) throw new Error(`Wallet not found for User ID ${finalUserId}`);
    const wallet = walletRes.rows[0];

    // B. Get Current Stock Price
    const stockRes = await client.query('SELECT current_price FROM stocks WHERE stock_id = $1', [finalStockId]);
    if (stockRes.rows.length === 0) throw new Error(`Stock not found for Stock ID ${finalStockId}`);
    
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
      [finalUserId, finalStockId, quantity, price]
    );

    await client.query('COMMIT');
    res.json({ message: 'Buy Order Executed!', newBalance: Number(wallet.balance) - totalCost });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    // FIX 3: Send the ACTUAL error message to the UI
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// 2. SELL STOCK
router.post('/sell', async (req, res) => {
  // STEP 1: Check Market Hours
  const isOpen = await checkMarketStatus(res);
  if (!isOpen) return;

  const client = await pool.connect();
  try {
    // FIX 1: Normalize IDs here too
    const { user_id, userId, stock_id, stockId, quantity } = req.body;
    const finalUserId = user_id || userId;
    const finalStockId = stock_id || stockId;

    // FIX 2: Validate Data
    if (!finalUserId || !finalStockId) {
        return res.status(400).json({ error: "Missing Data: userId or stockId" });
    }
    
    await client.query('BEGIN');

    // A. Verify User Has the Stock (Simple Check)
    const portfolioRes = await client.query(`
      SELECT 
        SUM(CASE WHEN order_type = 'BUY' THEN quantity ELSE -quantity END) as net_qty 
      FROM orders 
      WHERE user_id = $1 AND stock_id = $2
    `, [finalUserId, finalStockId]);

    const currentQty = portfolioRes.rows[0].net_qty || 0;
    
    if (Number(currentQty) < Number(quantity)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Not enough shares. You have ${currentQty}.` });
    }

    // B. Get Price
    const stockRes = await client.query('SELECT current_price FROM stocks WHERE stock_id = $1', [finalStockId]);
    if (stockRes.rows.length === 0) throw new Error('Stock not found');

    const price = Number(stockRes.rows[0].current_price);
    const totalValue = price * Number(quantity);

    // C. Add Money to Wallet
    await client.query('UPDATE wallets SET balance = balance + $1 WHERE user_id = $2', [totalValue, finalUserId]);

    // D. Record Order (SELL)
    await client.query(
      `INSERT INTO orders (user_id, stock_id, order_type, quantity, price_per_share, status, created_at) 
       VALUES ($1, $2, 'SELL', $3, $4, 'COMPLETED', NOW())`,
      [finalUserId, finalStockId, quantity, price]
    );

    await client.query('COMMIT');
    res.json({ message: 'Sell Order Executed!', saleValue: totalValue });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    // FIX 3: Send the ACTUAL error message to the UI
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
