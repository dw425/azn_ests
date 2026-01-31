// backend/utils/stockMath.js

/**
 * Geometric Brownian Motion (GBM) Simulator
 * Generates the next price based on current price, drift, and volatility.
 */
function getNextPrice(currentPrice, volatility = 0.0002, dt = 1/390) {
    // 1/390 represents one interval in a standard trading day (390 minutes)
    // Volatility is kept low (0.0002) for realistic 2-minute movements
    
    const drift = 0.0; // Assume neutral market drift for now
    
    // Box-Muller transform for standard normal distribution
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);

    // GBM Formula
    const change = Math.exp((drift - 0.5 * volatility * volatility) * dt + volatility * Math.sqrt(dt) * z);
    
    // Return new price rounded to 2 decimals
    return parseFloat((currentPrice * change).toFixed(2));
}

module.exports = { getNextPrice };
