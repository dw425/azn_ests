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
            SELECT h.quantity, s.current_price, s.daily_open
            FROM holdings h
            JOIN stocks s ON h.stock_id = s.stock_id
            WHERE h.user_id = $1
        `, [userId]);

        let stockValue = 0;
        let dayStartValue = 0;

        holdingsRes.rows.forEach(row => {
            const qty = Number(row.quantity);
            const curr = Number(row.current_price);
            const open = Number(row.daily_open) || curr; // Fallback to current if daily_open is null
            
            stockValue += qty * curr;
            dayStartValue += qty * open;
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
                s.daily_open,
                (s.current_price * h.quantity) as market_value,
                ((s.current_price - h.average_buy_price) * h.quantity) as total_gain,
                CASE 
                    WHEN s.daily_open IS NOT NULL AND s.daily_open > 0
                    THEN ((s.current_price - s.daily_open) / s.daily_open) * 100
                    ELSE 0
                END as day_change
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

// 3. GET CHART DATA (Supports range: 1D, 5D, 30D, 90D, 1Y + stock filtering)
router.get('/chart/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const range = req.query.range || '30D';
        const stockFilter = req.query.stocks; // comma-separated stock_ids (optional)
        
        // 1. Get current wallet cash
        const walletRes = await db.query('SELECT balance FROM wallets WHERE user_id = $1', [userId]);
        const cash = walletRes.rows[0] ? Number(walletRes.rows[0].balance) : 0;

        // 2. Determine interval based on range
        let interval;
        let useHourly = false;
        switch (range) {
            case '1D':  interval = '1 day';   useHourly = true; break;
            case '5D':  interval = '5 days';  break;
            case '30D': interval = '30 days'; break;
            case '90D': interval = '90 days'; break;
            case '1Y':  interval = '365 days'; break;
            default:    interval = '30 days'; break;
        }

        // 3. Build stock filter clause
        let stockClause = '';
        let queryParams = [userId];
        
        if (stockFilter) {
            const stockIds = stockFilter.split(',').map(Number).filter(n => !isNaN(n));
            if (stockIds.length > 0) {
                stockClause = `AND h.stock_id = ANY($2)`;
                queryParams.push(stockIds);
            }
        }

        // 4. Query based on range type
        let query;
        if (useHourly) {
            // 1D: Use all records from today (hourly snapshots from priceEngine)
            query = `
                SELECT 
                    sp.recorded_at as date,
                    SUM(sp.price * h.quantity) as stock_value
                FROM holdings h
                JOIN stock_prices sp ON h.stock_id = sp.stock_id
                WHERE h.user_id = $1
                AND sp.recorded_at > NOW() - INTERVAL '${interval}'
                ${stockClause}
                GROUP BY sp.recorded_at
                ORDER BY date ASC
            `;
        } else {
            // 5D/30D/90D/1Y: Use EOD close prices (one per day)
            query = `
                WITH DailyPrices AS (
                    SELECT DISTINCT ON (stock_id, recorded_at::DATE)
                        stock_id, 
                        price as close_price, 
                        recorded_at::DATE as trade_date
                    FROM stock_prices
                    WHERE recorded_at > NOW() - INTERVAL '${interval}'
                    ORDER BY stock_id, recorded_at::DATE, recorded_at DESC
                )
                SELECT 
                    dp.trade_date as date,
                    SUM(dp.close_price * h.quantity) as stock_value
                FROM holdings h
                JOIN DailyPrices dp ON h.stock_id = dp.stock_id
                WHERE h.user_id = $1
                ${stockClause}
                GROUP BY dp.trade_date
                ORDER BY date ASC
            `;
        }
        
        const result = await db.query(query, queryParams);
        
        // 5. Format for Frontend — send raw ISO dates, let browser handle timezone
        const chartData = result.rows.map((row, index) => ({
            day: index + 1,
            date: row.date, // Raw timestamp — frontend formats in user's timezone
            value: Number(row.stock_value) + cash
        }));

        // If no history exists, return flat line
        if (chartData.length === 0) {
            return res.json([
                { day: 1, date: 'Now', value: cash },
                { day: 2, date: 'Now', value: cash }
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
