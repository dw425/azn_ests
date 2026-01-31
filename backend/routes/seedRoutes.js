const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const { getNextPrice } = require('../utils/stockMath');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

router.post('/generate-prices', async (req, res) => {
    const client = await pool.connect();
    try {
        const { startMonth, endMonth, year } = req.body;
        const targetYear = year || 2026;
        const sMonth = startMonth !== undefined ? startMonth : 1; 
        const eMonth = endMonth !== undefined ? endMonth : 11;

        console.log(`Starting Seed for ${targetYear}, Months: ${sMonth}-${eMonth}`);

        // FIX 1: Select 'stock_id' instead of 'id'
        const stockRes = await client.query('SELECT stock_id, current_price, ticker FROM stocks');
        const stocks = stockRes.rows;

        let totalRecords = 0;
        
        for (let month = sMonth; month <= eMonth; month++) {
            const daysInMonth = new Date(targetYear, month + 1, 0).getDate();

            for (let day = 1; day <= daysInMonth; day++) {
                const date = new Date(targetYear, month, day);
                const dayOfWeek = date.getDay();

                if (dayOfWeek === 0 || dayOfWeek === 6) continue;

                let currentHour = 14; 
                let currentMinute = 30;

                const values = [];
                const placeholders = [];
                let paramIndex = 1;

                while (currentHour < 21 || (currentHour === 21 && currentMinute === 0)) {
                    const timeStr = `${targetYear}-${month + 1}-${day} ${currentHour}:${currentMinute}:00`;

                    stocks.forEach(stock => {
                        const currentPrice = Number(stock.current_price);
                        const newPrice = getNextPrice(currentPrice);
                        
                        stock.current_price = newPrice; 

                        // FIX 2: Use 'stock.stock_id' for the insert
                        values.push(stock.stock_id, newPrice, timeStr);
                        placeholders.push(`($${paramIndex}, $${paramIndex+1}, $${paramIndex+2})`);
                        paramIndex += 3;
                    });

                    currentMinute += 2;
                    if (currentMinute >= 60) {
                        currentMinute -= 60;
                        currentHour++;
                    }
                }

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

        // FIX 3: Update stocks table using 'stock_id'
        for (const stock of stocks) {
            await client.query('UPDATE stocks SET current_price = $1 WHERE stock_id = $2', 
                [stock.current_price, stock.stock_id]);
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
