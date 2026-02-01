const { Pool } = require('pg');

// 1. Setup Database Connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// 2. The Logic to Update Prices (The "Pulse")
const updatePrices = async () => {
    try {
        // A. Check if Market is OPEN
        const settingsRes = await pool.query('SELECT market_status FROM system_settings WHERE id = 1');
        
        // If settings exist AND market is CLOSED, stop here.
        if (settingsRes.rows.length > 0 && settingsRes.rows[0].market_status === 'CLOSED') {
            return; 
        }

        // B. Get All Stocks
        const stocksRes = await pool.query('SELECT stock_id, current_price FROM stocks');
        
        // C. Loop through each stock and change price
        for (let stock of stocksRes.rows) {
            const oldPrice = Number(stock.current_price);
            
            // Random fluctuation between -2% and +2%
            const percentChange = (Math.random() * 0.04) - 0.02;
            
            let newPrice = oldPrice * (1 + percentChange);
            
            // Safety: Never let price go below $0.01
            if (newPrice < 0.01) newPrice = 0.01;

            // D. Save to Database
            await pool.query('UPDATE stocks SET current_price = $1 WHERE stock_id = $2', [newPrice, stock.stock_id]);
        }
        console.log(`✅ Updated prices for ${stocksRes.rows.length} stocks.`);

    } catch (err) {
        console.error("❌ Price Engine Error:", err);
    }
};

// 3. The Function to Start the Timer
const startEngine = () => {
    console.log("🚀 Stock Price Engine Started...");
    
    // Run the updatePrices function every 10 seconds (10000 ms)
    setInterval(updatePrices, 10000); 
};

// 4. EXPORT IT (This is what your server was missing!)
module.exports = { startEngine };
