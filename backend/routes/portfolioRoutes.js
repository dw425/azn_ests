const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// HELPER: Check if Market is Open (Simple Weekend Check)
// Returns FALSE if Saturday or Sunday
const isMarketOpen = () => {
    const today = new Date();
    const day = today.getDay(); // 0 = Sunday, 6 = Saturday
    return (day !== 0 && day !== 6);
};

// GET /api/portfolio/summary/:userId
router.get('/summary/:userId', async (req, res) => {
    const client = await pool.connect();
    try {
        const { userId } = req.params;

        // 1. Get Cash
        const walletRes = await client.query('SELECT balance FROM wallets WHERE user_id = $1', [userId]);
        const cash = walletRes.rows.length > 0 ? Number(walletRes.rows[0].balance) : 0;

        // 2. Get Holdings Value
        const holdingsRes = await client.query(`
            SELECT t.stock_id, SUM(t.quantity) as qty, s.current_price
            FROM trades t
            JOIN stocks s ON t.stock_id = s.stock_id
            WHERE t.user_id = $1
            GROUP BY t.stock_id, s.current_price
        `, [userId]);

        let stockValue = 0;
        for (const row of holdingsRes.rows) {
            stockValue += (Number(row.qty) * Number(row.current_price));
        }

        const totalValue = cash + stockValue;
        
        // 3. Recent Activity
        const activityRes = await client.query(`
            SELECT t.*, s.ticker 
            FROM trades t
            JOIN stocks s ON t.stock_id = s.stock_id
            WHERE t.user_id = $1
            ORDER BY t.executed_at DESC LIMIT 1
        `, [userId]);

        // 4. CALCULATE DAY CHANGE
        // If Weekend -> 0. If Weekday -> Simulate or Calculate
        let dayChangePct = 0;
        let dayChange = 0;

        if (isMarketOpen()) {
            // Logic: Simulating fluctuation for now. 
            // In a real app with 'open_price', this would be: (current - open) * qty
            dayChangePct = (Math.random() * 2.5) - 1; 
            dayChange = totalValue * (dayChangePct / 100);
        }

        res.json({
            cash: cash,
            stockValue: stockValue,
            totalValue: totalValue,
            dayChange: dayChange, 
            dayChangePct: dayChangePct,
            recentActivity: activityRes.rows[0] || null
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// GET /api/portfolio/holdings/:userId
router.get('/holdings/:userId', async (req, res) => {
    const client = await pool.connect();
    try {
        const { userId } = req.params;
        const marketOpen = isMarketOpen();

        const query = `
            SELECT 
                s.stock_id, 
                s.ticker, 
                s.company_name, 
                s.current_price,
                SUM(t.quantity) as quantity,
                SUM(t.quantity * t.price_executed) / SUM(t.quantity) as avg_cost
            FROM trades t
            JOIN stocks s ON t.stock_id = s.stock_id
            WHERE t.user_id = $1
            GROUP BY s.stock_id, s.ticker, s.company_name, s.current_price
            ORDER BY quantity DESC
        `;
        
        const result = await client.query(query, [userId]);
        
        const holdings = result.rows.map(row => {
            const qty = Number(row.quantity);
            const current = Number(row.current_price);
            const avg = Number(row.avg_cost);
            const marketValue = qty * current;
            const totalCost = qty * avg;
            const totalGain = marketValue - totalCost;
            const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;

            // CHECK MARKET STATUS
            const dayChange = marketOpen ? ((Math.random() * 5) - 2) : 0;

            return {
                ...row,
                quantity: qty,
                current_price: current,
                avg_cost: avg,
                market_value: marketValue,
                total_cost: totalCost,
                total_gain: totalGain,
                total_gain_pct: totalGainPct,
                day_change: dayChange
            };
        });

        res.json(holdings);

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// GET /api/portfolio/chart/:userId (Existing Real-Data Engine)
router.get('/chart/:userId', async (req, res) => {
    const client = await pool.connect();
    try {
        const { userId } = req.params;
        const days = 30;

        // 1. Get User's Trade History
        const tradesRes = await client.query(`
            SELECT stock_id, quantity, price_executed, executed_at
            FROM trades 
            WHERE user_id = $1
            ORDER BY executed_at ASC
        `, [userId]);
        const trades = tradesRes.rows;

        // 2. Identify which stocks we need prices for
        const stockIds = [...new Set(trades.map(t => t.stock_id))];

        let priceMap = {}; 

        if (stockIds.length > 0) {
            const pricesRes = await client.query(`
                SELECT stock_id, price, recorded_at 
                FROM stock_prices 
                WHERE stock_id = ANY($1) 
                AND recorded_at >= NOW() - INTERVAL '40 days'
                ORDER BY recorded_at ASC
            `, [stockIds]);

            pricesRes.rows.forEach(row => {
                if (!priceMap[row.stock_id]) priceMap[row.stock_id] = [];
                priceMap[row.stock_id].push({
                    date: new Date(row.recorded_at),
                    price: Number(row.price)
                });
            });
        }

        // 3. Build Chart Data
        const chartData = [];
        const today = new Date();
        const startCash = 10000; 

        for (let i = days - 1; i >= 0; i--) {
            const currentDate = new Date(today);
            currentDate.setDate(today.getDate() - i);
            currentDate.setHours(23, 59, 59, 999);

            let currentCash = startCash;
            const currentHoldings = {}; 

            trades.forEach(trade => {
                const tradeDate = new Date(trade.executed_at);
                if (tradeDate <= currentDate) {
                    const cost = Number(trade.quantity) * Number(trade.price_executed);
                    currentCash -= cost;
                    if (!currentHoldings[trade.stock_id]) currentHoldings[trade.stock_id] = 0;
                    currentHoldings[trade.stock_id] += Number(trade.quantity);
                }
            });

            let stockValue = 0;
            Object.keys(currentHoldings).forEach(stockId => {
                const qty = currentHoldings[stockId];
                if (qty > 0) {
                    const history = priceMap[stockId] || [];
                    const relevantPrice = history.filter(p => p.date <= currentDate).pop();
                    if (relevantPrice) {
                        stockValue += (qty * relevantPrice.price);
                    } else {
                        const lastTrade = trades.find(t => t.stock_id == stockId);
                        if(lastTrade) stockValue += (qty * Number(lastTrade.price_executed));
                    }
                }
            });

            chartData.push({
                day: i,
                value: currentCash + stockValue,
                date: currentDate.toISOString().split('T')[0]
            });
        }
        
        res.json(chartData);

    } catch (err) {
        console.error("Chart Error:", err);
        res.json([]);
    } finally {
        client.release();
    }
});

module.exports = router;
