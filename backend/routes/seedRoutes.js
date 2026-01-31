// backend/routes/seedRoutes.js
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const { getNextPrice } = require('../utils/stockMath');

// Use the internal connection string for speed on Render
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

router.post('/generate-prices', async (req, res) => {
    const client = await pool.connect();
    try {
        const { startMonth, endMonth, year } = req.body;
        // Default to Feb (1) to Dec (11) 2026 if not provided
        const targetYear = year || 2026;
        const sMonth = startMonth !== undefined ? startMonth : 1; // 1 = Feb
        const eMonth = endMonth !== undefined ? endMonth : 11;    // 11 = Dec

        console.log(`Starting Seed for ${targetYear}, Months: ${sMonth}-${eMonth}`);

        // 1. Get all active stocks
        const stockRes = await client.query('SELECT id, current_price, ticker FROM stocks');
        const stocks = stockRes.rows;

        let totalRecords = 0;
        
        // Loop through each month
        for (let month = sMonth; month <= eMonth; month++) {
            // Get days in month
            const daysInMonth = new Date(targetYear, month + 1, 0).getDate();

            for (let day = 1; day <= daysInMonth; day++) {
                const date = new Date(targetYear, month, day);
                const dayOfWeek = date.getDay();

                // Skip Weekends (0=Sun, 6=Sat) [cite: 28]
                if (dayOfWeek === 0 || dayOfWeek === 6) continue;

                // Set Market Hours: 09:30 to 16:00 EST [cite: 6]
                // Note: Storing in UTC. EST is UTC-5. 
                // 9:30 EST = 14:30 UTC. 16:00 EST = 21:00 UTC.
                let currentHour = 14; 
                let currentMinute = 30;

                const values = [];
                const placeholders = [];
                let paramIndex = 1;

                // Loop until 16:00 (21:00 UTC)
                while (currentHour < 21 || (currentHour === 21 && currentMinute === 0)) {
                    
                    // Format timestamp string for Postgres
                    const timeStr = `${targetYear}-${month + 1}-${day} ${currentHour}:${currentMinute}:00`;

                    // Generate price for EACH stock
                    stocks.forEach(stock => {
                        const newPrice = getNextPrice(Number(stock.current_price));
                        
                        // Update our local reference so the next interval uses this new price
                        stock.current_price = newPrice; 

                        // Prepare batch insert
                        values.push(stock.id, newPrice, timeStr);
                        placeholders.push(`($${paramIndex}, $${paramIndex+1}, $${paramIndex+2})`);
                        paramIndex += 3;
                    });

                    // Increment by 2 minutes [cite: 48]
                    currentMinute += 2;
                    if (currentMinute >= 60) {
                        currentMinute -= 60;
                        currentHour++;
                    }
                }

                // Batch Insert for the day (Performance optimization)
                if (placeholders.length > 0) {
                    const query = `
                        INSERT INTO stock_prices (stock_id, price, recorded_at) 
                        VALUES ${placeholders.join(',')}
                    `;
                    await client.query(query, values);
                    totalRecords += (values.length / 3);
                }
            }
            console.log(`Finished Month ${month + 1}`);
        }

        // Final update of current_price in stocks table to match the end of year
        for (const stock of stocks) {
            await client.query('UPDATE stocks SET current_price = $1 WHERE id = $2', 
                [stock.current_price, stock.id]);
        }

        res.json({ 
            success: true, 
            message: `Generated ${totalRecords} price records for ${targetYear}`,
            last_status: "Stocks updated to latest simulated price"
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

module.exports = router;
