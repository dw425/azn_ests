const { Pool } = require('pg');

// 1. Setup Database Connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Track state across ticks
let lastDay = null;
let lastSnapshotHour = null; // Track when we last wrote to stock_prices

// 2. The Logic to Update Prices (The "Pulse")
const updatePrices = async () => {
    try {
        // A. Check if Market is OPEN
        const settingsRes = await pool.query('SELECT market_status, simulated_date FROM system_settings WHERE id = 1');
        
        // If settings exist AND market is CLOSED, stop here.
        if (settingsRes.rows.length > 0 && settingsRes.rows[0].market_status === 'CLOSED') {
            return; 
        }

        // B. Determine the current "day" (simulated or real)
        const simDate = settingsRes.rows[0]?.simulated_date ? new Date(settingsRes.rows[0].simulated_date) : new Date();
        const currentDay = simDate.toISOString().split('T')[0]; // YYYY-MM-DD
        const currentHour = new Date().getHours(); // Real clock hour for snapshots

        // C. NEW DAY DETECTION: Reset daily_open, day_high, day_low
        if (lastDay !== null && lastDay !== currentDay) {
            await pool.query(`
                UPDATE stocks SET 
                    daily_open = current_price, 
                    day_high = current_price, 
                    day_low = current_price
            `);
            console.log(`📅 New trading day: ${currentDay} — daily prices reset`);
            lastSnapshotHour = null; // Reset snapshot tracker for new day
        }

        // D. FIRST RUN: If daily_open is NULL (server just started), set it now
        if (lastDay === null) {
            await pool.query(`
                UPDATE stocks SET 
                    daily_open = COALESCE(daily_open, current_price),
                    day_high = COALESCE(day_high, current_price),
                    day_low = COALESCE(day_low, current_price)
            `);
            console.log(`🔧 First run — ensured daily_open is set for all stocks`);
        }

        lastDay = currentDay;

        // E. Get All Stocks (Include Volatility + daily tracking)
        const stocksRes = await pool.query('SELECT stock_id, current_price, volatility, day_high, day_low FROM stocks');
        
        // F. Loop through each stock and change price
        for (let stock of stocksRes.rows) {
            const oldPrice = Number(stock.current_price);
            
            // Use the stock's specific volatility (default to 2% if missing)
            const vol = stock.volatility ? Number(stock.volatility) : 0.02;
            
            // Calculate random swing based on volatility
            const percentChange = (Math.random() * vol * 2) - vol;
            
            let newPrice = oldPrice * (1 + percentChange);
            
            // Safety: Never let price go below $0.01
            if (newPrice < 0.01) newPrice = 0.01;

            // G. Update price AND daily high/low tracking
            const currentHigh = stock.day_high ? Number(stock.day_high) : newPrice;
            const currentLow = stock.day_low ? Number(stock.day_low) : newPrice;
            const newHigh = Math.max(currentHigh, newPrice);
            const newLow = Math.min(currentLow, newPrice);

            await pool.query(
                'UPDATE stocks SET current_price = $1, day_high = $2, day_low = $3 WHERE stock_id = $4', 
                [newPrice, newHigh, newLow, stock.stock_id]
            );
        }

        // H. SNAPSHOT EVERY 5 MINUTES: Write current prices to stock_prices
        //    This builds intraday data for the 1D chart view
        const now = new Date();
        const minuteSlot = Math.floor(now.getMinutes() / 5); // 0-11 (twelve 5-min slots per hour)
        const snapshotKey = `${now.getHours()}-${minuteSlot}`;
        
        if (lastSnapshotHour !== snapshotKey) {
            // Round to nearest 5-min mark for clean timestamps
            const snapshotTime = new Date(now);
            snapshotTime.setMinutes(minuteSlot * 5, 0, 0);
            const snapshotISO = snapshotTime.toISOString();
            
            const freshPrices = await pool.query('SELECT stock_id, current_price FROM stocks');
            
            for (let stock of freshPrices.rows) {
                await pool.query(
                    `INSERT INTO stock_prices (stock_id, price, recorded_at) 
                     VALUES ($1, $2, $3) 
                     ON CONFLICT (stock_id, recorded_at) DO NOTHING`,
                    [stock.stock_id, stock.current_price, snapshotISO]
                );
            }
            
            lastSnapshotHour = snapshotKey;
            console.log(`📸 Snapshot saved at ${snapshotISO} — ${freshPrices.rows.length} stocks recorded`);
        }

    } catch (err) {
        console.error("❌ Price Engine Error:", err);
    }
};

// 3. The Function to Start the Timer
const startEngine = () => {
    console.log("🚀 Stock Price Engine Started... (Daily Tracking + 5-Min Snapshots Enabled)");
    
    // Run the updatePrices function every 10 seconds
    setInterval(updatePrices, 10000); 
};

module.exports = { startEngine };
