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

        // B. Get All Stocks (Include Volatility)
        // We now fetch the specific volatility assigned to each stock
        const stocksRes = await pool.query('SELECT stock_id, current_price, volatility FROM stocks');
        
        // C. Loop through each stock and change price
        for (let stock of stocksRes.rows) {
            const oldPrice = Number(stock.current_price);
            
            // Use the stock's specific volatility (default to 2% if missing)
            // Example: Volatility 0.05 means +/- 5% swing
            const vol = stock.volatility ? Number(stock.volatility) : 0.02;
            
            // Calculate random swing based on volatility
            // (Math.random() * vol * 2) - vol gives a range of [-vol, +vol]
            const percentChange = (Math.random() * vol * 2) - vol;
            
            let newPrice = oldPrice * (1 + percentChange);
            
            // Safety: Never let price go below $0.01
            if (newPrice < 0.01) newPrice = 0.01;

            // D. Save to Database
            await pool.query('UPDATE stocks SET current_price = $1 WHERE stock_id = $2', [newPrice, stock.stock_id]);
        }
        
        // Optional: Log less frequently to avoid cluttering logs
        // console.log(`✅ Updated prices for ${stocksRes.rows.length} stocks.`);

    } catch (err) {
        console.error("❌ Price Engine Error:", err);
    }
};

// 3. The Function to Start the Timer
const startEngine = () => {
    console.log("🚀 Stock Price Engine Started... (Dynamic Volatility Enabled)");
    
    // Run the updatePrices function every 10 seconds
    setInterval(updatePrices, 10000); 
};

module.exports = { startEngine };
