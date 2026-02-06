const { Pool } = require('pg');

// 1. Setup Database Connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Track last known day to detect day changes
let lastDay = null;

// 2. The Logic to Update Prices (The "Pulse")
const updatePrices = async () => {
    try {
        // A. Check if Market is OPEN
        const settingsRes = await pool.query('SELECT market_status, simulated_date FROM system_settings WHERE id = 1');
        
        // If settings exist AND market is CLOSED, stop here.
        if (settingsRes.rows.length > 0 && settingsRes.rows[0].market_status === 'CLOSED') {
            return; 
        }

        // B. Check if it's a new day — reset daily tracking
        const simDate = settingsRes.rows[0]?.simulated_date ? new Date(settingsRes.rows[0].simulated_date) : new Date();
        const currentDay = simDate.toISOString().split('T')[0]; // YYYY-MM-DD

        if (lastDay !== null && lastDay !== currentDay) {
            // NEW DAY: Reset daily_open, day_high, day_low to current prices
            await pool.query(`
                UPDATE stocks SET 
                    daily_open = current_price, 
                    day_high = current_price, 
                    day_low = current_price
            `);
            console.log(`📅 New trading day: ${currentDay} — daily prices reset`);
        }
        lastDay = currentDay;

        // C. Get All Stocks (Include Volatility + daily tracking)
        const stocksRes = await pool.query('SELECT stock_id, current_price, volatility, day_high, day_low FROM stocks');
        
        // D. Loop through each stock and change price
        for (let stock of stocksRes.rows) {
            const oldPrice = Number(stock.current_price);
            
            // Use the stock's specific volatility (default to 2% if missing)
            const vol = stock.volatility ? Number(stock.volatility) : 0.02;
            
            // Calculate random swing based on volatility
            const percentChange = (Math.random() * vol * 2) - vol;
            
            let newPrice = oldPrice * (1 + percentChange);
            
            // Safety: Never let price go below $0.01
            if (newPrice < 0.01) newPrice = 0.01;

            // E. Update price AND daily high/low tracking
            const currentHigh = stock.day_high ? Number(stock.day_high) : newPrice;
            const currentLow = stock.day_low ? Number(stock.day_low) : newPrice;
            const newHigh = Math.max(currentHigh, newPrice);
            const newLow = Math.min(currentLow, newPrice);

            await pool.query(
                'UPDATE stocks SET current_price = $1, day_high = $2, day_low = $3 WHERE stock_id = $4', 
                [newPrice, newHigh, newLow, stock.stock_id]
            );
        }

    } catch (err) {
        console.error("❌ Price Engine Error:", err);
    }
};

// 3. The Function to Start the Timer
const startEngine = () => {
    console.log("🚀 Stock Price Engine Started... (Daily Tracking Enabled)");
    
    // Run the updatePrices function every 10 seconds
    setInterval(updatePrices, 10000); 
};

module.exports = { startEngine };
