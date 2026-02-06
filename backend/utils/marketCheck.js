/**
 * Market Status Checker
 * Determines if trading is currently allowed based on:
 * 1. Force Override (admin can manually open/close)
 * 2. Market Hours (configurable open/close times)
 * 3. Weekday check (Mon-Fri only)
 * 4. Holiday check (admin-defined dates)
 */

const db = require('../db');

async function getMarketStatus() {
    try {
        const result = await db.query('SELECT * FROM system_settings WHERE id = 1');
        
        if (result.rows.length === 0) {
            return { allowed: true, reason: 'No settings found, defaulting to open', status: 'OPEN' };
        }

        const settings = result.rows[0];
        const forceOverride = settings.force_override || false;

        // 1. FORCE OVERRIDE — Admin has manually set the status
        if (forceOverride) {
            const isOpen = settings.market_status === 'OPEN';
            return {
                allowed: isOpen,
                reason: isOpen ? 'Market forced OPEN by administrator' : 'Market forced CLOSED by administrator',
                status: settings.market_status,
                forced: true
            };
        }

        // 2. AUTO MODE — Check schedule
        // Use simulated_date if set, otherwise real time
        const now = settings.simulated_date ? new Date(settings.simulated_date) : new Date();
        
        const openTime = settings.market_open_time || '09:30';
        const closeTime = settings.market_close_time || '16:00';

        // 2a. Weekday check (0=Sun, 6=Sat) — use UTC to match stored time
        const dayOfWeek = now.getUTCDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            await db.query('UPDATE system_settings SET market_status = $1 WHERE id = 1', ['CLOSED']);
            return {
                allowed: false,
                reason: `Market closed — ${dayOfWeek === 0 ? 'Sunday' : 'Saturday'} (weekends)`,
                status: 'CLOSED',
                forced: false
            };
        }

        // 2b. Holiday check
        let holidays = [];
        try {
            holidays = JSON.parse(settings.holidays || '[]');
        } catch (e) {
            holidays = [];
        }
        
        // Format current date as YYYY-MM-DD using UTC
        const year = now.getUTCFullYear();
        const month = String(now.getUTCMonth() + 1).padStart(2, '0');
        const day = String(now.getUTCDate()).padStart(2, '0');
        const todayStr = `${year}-${month}-${day}`;
        const matchedHoliday = holidays.find(h => h.date === todayStr);
        
        if (matchedHoliday) {
            await db.query('UPDATE system_settings SET market_status = $1 WHERE id = 1', ['CLOSED']);
            return {
                allowed: false,
                reason: `Market closed — Holiday: ${matchedHoliday.name || todayStr}`,
                status: 'CLOSED',
                forced: false
            };
        }

        // 2c. Hours check — use UTC to match stored time
        const currentHours = now.getUTCHours();
        const currentMinutes = now.getUTCMinutes();
        const currentTimeMinutes = currentHours * 60 + currentMinutes;

        const [openH, openM] = openTime.split(':').map(Number);
        const [closeH, closeM] = closeTime.split(':').map(Number);
        const openTimeMinutes = openH * 60 + openM;
        const closeTimeMinutes = closeH * 60 + closeM;

        if (currentTimeMinutes < openTimeMinutes) {
            await db.query('UPDATE system_settings SET market_status = $1 WHERE id = 1', ['CLOSED']);
            return {
                allowed: false,
                reason: `Market closed — Opens at ${openTime} (current: ${String(currentHours).padStart(2,'0')}:${String(currentMinutes).padStart(2,'0')})`,
                status: 'CLOSED',
                forced: false
            };
        }

        if (currentTimeMinutes >= closeTimeMinutes) {
            await db.query('UPDATE system_settings SET market_status = $1 WHERE id = 1', ['CLOSED']);
            return {
                allowed: false,
                reason: `Market closed — Closed at ${closeTime} (current: ${String(currentHours).padStart(2,'0')}:${String(currentMinutes).padStart(2,'0')})`,
                status: 'CLOSED',
                forced: false
            };
        }

        // All checks passed — market is open
        await db.query('UPDATE system_settings SET market_status = $1 WHERE id = 1', ['OPEN']);
        return {
            allowed: true,
            reason: 'Market is open',
            status: 'OPEN',
            forced: false
        };

    } catch (err) {
        console.error('Market Status Check Error:', err);
        // Fail-open: allow trading if the check itself fails
        return { allowed: true, reason: 'Status check error, defaulting to open', status: 'OPEN' };
    }
}

module.exports = { getMarketStatus };
