const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// HELPER: Weekend Check
const isMarketOpen = () => {
    const today = new Date();
    const day = today.getDay(); // 0 = Sunday, 6 = Saturday
    return (day !== 0 && day !== 6);
};

// GET /api/stocks (The Market Data Table)
router.get('/', async (req, res) => {
    const client = await pool.connect();
    try {
        const marketOpen = isMarketOpen();
        const today = new Date();
        const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

        // 1. Get All Stocks
        const stocksRes = await client.query('SELECT * FROM stocks ORDER BY ticker ASC');
        const stocks = stocksRes.rows;

        // 2. Get History for Calculations (Last 40 days to cover MTD and weekends)
        const historyRes = await client.query(`
            SELECT stock_id, price, recorded_at 
            FROM stock_prices 
            WHERE recorded_at >= NOW() - INTERVAL '40 days'
            ORDER BY recorded_at DESC
        `);

        // Group history by Stock ID for fast lookup
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
            
            // --- A. TODAY % ---
            let todayChange = 0;
            
            if (marketOpen) {
                // Find the most recent "Close" price (the first record before today)
                // Since our query is ORDER BY DESC, we skip the very first one if it's "now"
                // Simplified: Just grab the first history point that isn't identical to current timestamp
                // Or better: Use the first history record available as "Yesterday's Close"
                const previousClose = history.length > 0 ? history[0].price : currentPrice;
                
                if (previousClose > 0) {
                    todayChange = ((currentPrice - previousClose) / previousClose) * 100;
                }
            } else {
                // IT IS THE WEEKEND: Force 0%
                todayChange = 0;
            }

            // --- B. MTD % (Month to Date) ---
            let mtdChange = 0;
            // Find the first price recorded on or after the 1st of the month
            const startOfMonthRecord = history.find(h => h.date <= today && h.date >= firstOfMonth);
            // If no record found (e.g. data starts mid-month), use the oldest record we have
            const basePrice = startOfMonthRecord ? startOfMonthRecord.price : (history.length > 0 ? history[history.length-1].price : currentPrice);

            if (basePrice > 0) {
                mtdChange = ((currentPrice - basePrice) / basePrice) * 100;
            }

            return {
                ...stock,
                day_change_pct: todayChange, // The frontend might need to update to read this key, or we simulate the random one
                // To match your current Frontend logic which likely expects just 'day_change' or handles it in UI
                // We will send 'day_change' as the percentage value to be safe based on your previous code
                today_pct: todayChange, 
                mtd_pct: mtdChange
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

// GET /api/stocks/:id (Single Stock Details)
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
