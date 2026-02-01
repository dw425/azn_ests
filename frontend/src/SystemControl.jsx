// frontend/src/SystemControl.jsx
import React, { useState, useEffect } from 'react';

const SystemControl = () => {
    const [settings, setSettings] = useState({
        market_status: 'OPEN',
        simulated_date: new Date().toISOString().slice(0, 16) // Format for input
    });
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');

    // 1. Load current settings on mount
    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            // Note: Make sure your API_URL matches your setup (e.g. localhost:5000 or your Render URL)
            const response = await fetch('http://localhost:5000/api/admin/settings');
            const data = await response.json();
            
            // Format date for the datetime-local input field
            const formattedDate = new Date(data.simulated_date).toISOString().slice(0, 16);
            
            setSettings({
                market_status: data.market_status,
                simulated_date: formattedDate
            });
        } catch (err) {
            console.error("Failed to load settings", err);
        }
    };

    // 2. Save changes to Backend
    const handleSave = async () => {
        setLoading(true);
        try {
            await fetch('http://localhost:5000/api/admin/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings)
            });
            setMessage('Settings Updated Successfully!');
            setTimeout(() => setMessage(''), 3000); // Clear message after 3s
        } catch (err) {
            setMessage('Error updating settings');
        }
        setLoading(false);
    };

    // Toggle Handler
    const toggleMarket = () => {
        setSettings(prev => ({
            ...prev,
            market_status: prev.market_status === 'OPEN' ? 'CLOSED' : 'OPEN'
        }));
    };

    return (
        <div style={styles.container}>
            <h3 style={styles.title}>⚙️ System Control & Time Machine</h3>
            
            <div style={styles.controls}>
                {/* Market Status Toggle */}
                <div style={styles.group}>
                    <label style={styles.label}>Market Status:</label>
                    <button 
                        onClick={toggleMarket}
                        style={settings.market_status === 'OPEN' ? styles.openBtn : styles.closedBtn}
                    >
                        {settings.market_status}
                    </button>
                </div>

                {/* Date Simulation */}
                <div style={styles.group}>
                    <label style={styles.label}>System Date:</label>
                    <input 
                        type="datetime-local" 
                        value={settings.simulated_date}
                        onChange={(e) => setSettings({...settings, simulated_date: e.target.value})}
                        style={styles.input}
                    />
                </div>

                {/* Save Button */}
                <button onClick={handleSave} disabled={loading} style={styles.saveBtn}>
                    {loading ? 'Saving...' : 'Apply Changes'}
                </button>
            </div>
            
            {message && <p style={styles.message}>{message}</p>}
        </div>
    );
};

// Simple inline styles for quick layout
const styles = {
    container: {
        background: '#fff',
        padding: '20px',
        marginBottom: '20px',
        borderRadius: '8px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
    },
    title: { margin: '0 0 15px 0', color: '#333' },
    controls: { display: 'flex', gap: '20px', alignItems: 'flex-end', flexWrap: 'wrap' },
    group: { display: 'flex', flexDirection: 'column' },
    label: { marginBottom: '5px', fontSize: '14px', fontWeight: 'bold' },
    input: { padding: '8px', borderRadius: '4px', border: '1px solid #ddd' },
    openBtn: { padding: '8px 20px', background: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' },
    closedBtn: { padding: '8px 20px', background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' },
    saveBtn: { padding: '8px 20px', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' },
    message: { marginTop: '10px', color: 'green', fontSize: '14px' }
};

export default SystemControl;
