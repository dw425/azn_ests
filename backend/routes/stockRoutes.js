const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// GET /api/stocks (Market Data Table)
router.get('/', async (req, res) => {
    const client = await pool.connect();
    try {
        const today = new Date();
        const targetDateRolling = new Date();
        targetDateRolling.setDate(today.getDate() - 30); // 30 Days Ago

        // 1. Get All Stocks (Live Data)
        const stocksRes = await client.query('SELECT * FROM stocks ORDER BY ticker ASC');
        const stocks = stocksRes.rows;

        // 2. Get History (Look back 365 days to find valid past data)
        const historyRes = await client.query(`
            SELECT stock_id, price, recorded_at 
            FROM stock_prices 
            WHERE recorded_at >= NOW() - INTERVAL '365 days'
            ORDER BY recorded_at DESC
        `);

        // Group history by Stock ID
        const historyMap = {};
        historyRes.rows.forEach(record => {
            if (!historyMap[record.stock_id]) historyMap[record.stock_id] = [];
            historyMap[record.stock_id].push({
                price: Number(record.price),
                date: new Date(record.recorded_at)
            });
        });

        // 3. Calculate Real Metrics
        const marketData = stocks.map(stock => {
            const history = historyMap[stock.stock_id] || [];
            const currentPrice = Number(stock.current_price);
            
            // FILTER: Strict "Past Only" Logic
            // Ignore any data from the future (e.g. Dec 2026)
            // validHistory is sorted Newest -> Oldest
            const validHistory = history.filter(h => h.date <= today);
            
            // --- A. TODAY % (Live vs Last Close) ---
            let todayChange = 0;
            const lastCloseRecord = validHistory.length > 0 ? validHistory[0] : null;

            if (lastCloseRecord && lastCloseRecord.price > 0) {
                // Check for Weekend: If today is Sat/Sun, change is usually 0 unless we compare to Friday
                // Standard: Compare Live Price vs Last Recorded Close
                todayChange = ((currentPrice - lastCloseRecord.price) / lastCloseRecord.price) * 100;
            }

            // --- B. 30-DAY ROLLING % (Live vs ~30 Days Ago) ---
            let rollingChange = 0;
            // Find record closest to 30 days ago
            // We search for the first record that is <= targetDateRolling
            const pastRecord = validHistory.find(h => h.date <= targetDateRolling);
            
            // Fallback: If we don't have 30 days of data, use the oldest valid record we have
            const baseRecord = pastRecord || (validHistory.length > 0 ? validHistory[validHistory.length - 1] : null);

            if (baseRecord && baseRecord.price > 0) {
                rollingChange = ((currentPrice - baseRecord.price) / baseRecord.price) * 100;
            }

            return {
                ...stock,
                today_pct: todayChange, 
                rolling_pct: rollingChange // Updated Key Name
            };
        });

        res.json(marketData);

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// GET /api/stocks/:id
router.get('/:id', async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        const result = await client.query('SELECT * FROM stocks WHERE stock_id = $1', [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Stock not found' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

module.exports = router;
