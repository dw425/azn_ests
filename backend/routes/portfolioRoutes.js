const express = require('express');
const router = express.Router();
const db = require('../db'); // Singleton DB

// 1. GET PORTFOLIO SUMMARY (Cash, Stock Value, Total)
router.get('/summary/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        // Get Cash Balance
        const walletRes = await db.query('SELECT balance FROM wallets WHERE user_id = $1', [userId]);
        if (walletRes.rows.length === 0) {
            return res.json({ cash: 0, stockValue: 0, totalValue: 0, dayChange: 0, dayChangePct: 0 });
        }

        const cash = Number(walletRes.rows[0].balance);

        // Get Stock Value (Current Price * Quantity)
        const holdingsRes = await db.query(`
            SELECT h.quantity, s.current_price, s.base_price
            FROM holdings h
            JOIN stocks s ON h.stock_id = s.stock_id
            WHERE h.user_id = $1
        `, [userId]);

        let stockValue = 0;
        let dayStartValue = 0;

        holdingsRes.rows.forEach(row => {
            const qty = Number(row.quantity);
            const curr = Number(row.current_price);
            const base = Number(row.base_price); 
            
            stockValue += qty * curr;
            dayStartValue += qty * base;
        });

        const totalValue = cash + stockValue;
        const dayChange = stockValue - dayStartValue;
        const dayChangePct = dayStartValue > 0 ? (dayChange / dayStartValue) * 100 : 0;

        res.json({
            cash,
            stockValue,
            totalValue,
            dayChange,
            dayChangePct
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// 2. GET HOLDINGS (Detailed List)
router.get('/holdings/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const query = `
            SELECT 
                h.stock_id, 
                s.ticker, 
                s.name as company_name, 
                h.quantity, 
                s.current_price, 
                h.average_buy_price,
                (s.current_price * h.quantity) as market_value,
                ((s.current_price - h.average_buy_price) * h.quantity) as total_gain,
                (s.current_price - s.base_price) as day_change
            FROM holdings h
            JOIN stocks s ON h.stock_id = s.stock_id
            WHERE h.user_id = $1
            ORDER BY market_value DESC
        `;
        const result = await db.query(query, [userId]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// 3. GET CHART DATA (FIXED: Corrected aggregation logic)
router.get('/chart/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        // 1. Get current wallet cash
        const walletRes = await db.query('SELECT balance FROM wallets WHERE user_id = $1', [userId]);
        const cash = walletRes.rows[0] ? Number(walletRes.rows[0].balance) : 0;

        /**
         * 2. THE FIX: 
         * We first calculate the Average Price per day to flatten the 3,600+ points.
         * Then we multiply that Average by your holdings.
         */
        const query = `
            WITH DailyPrices AS (
                SELECT 
                    stock_id, 
                    AVG(price) as avg_day_price, 
                    recorded_at::DATE as trade_date
                FROM stock_prices
                WHERE recorded_at > NOW() - INTERVAL '30 days'
                GROUP BY stock_id, recorded_at::DATE
            )
            SELECT 
                dp.trade_date as date,
                SUM(dp.avg_day_price * h.quantity) as stock_value
            FROM holdings h
            JOIN DailyPrices dp ON h.stock_id = dp.stock_id
            WHERE h.user_id = $1
            GROUP BY dp.trade_date
            ORDER BY date ASC
        `;
        
        const result = await db.query(query, [userId]);
        
        // 3. Format for Frontend (Add Cash once per data point)
        const chartData = result.rows.map((row, index) => ({
            day: index + 1,
            date: new Date(row.date).toLocaleDateString(),
            value: Number(row.stock_value) + cash
        }));

        // If no history exists, return a flat line showing just the cash
        if (chartData.length === 0) {
            return res.json([
                { day: 1, value: cash },
                { day: 30, value: cash }
            ]);
        }

        res.json(chartData);

    } catch (err) {
        console.error("Chart Logic Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// 4. GET LAST ACTIVITY (Most recent action across trades + wallet)
router.get('/last-activity/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const query = `
            (
                SELECT 
                    'TRADE' as category,
                    t.order_type as action_type,
                    s.ticker as label,
                    t.total_amount as amount,
                    t.quantity,
                    t.created_at
                FROM transactions t
                JOIN stocks s ON t.stock_id = s.stock_id
                WHERE t.user_id = $1
                ORDER BY t.created_at DESC
                LIMIT 1
            )
            UNION ALL
            (
                SELECT 
                    'WALLET' as category,
                    wt.transaction_type as action_type,
                    wt.transaction_type as label,
                    wt.amount,
                    NULL as quantity,
                    wt.created_at
                FROM wallet_transactions wt
                JOIN wallets w ON wt.wallet_id = w.wallet_id
                WHERE w.user_id = $1
                ORDER BY wt.created_at DESC
                LIMIT 1
            )
            ORDER BY created_at DESC
            LIMIT 1
        `;
        const result = await db.query(query, [userId]);
        res.json(result.rows.length > 0 ? result.rows[0] : null);
    } catch (err) {
        console.error("Last Activity Error:", err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
