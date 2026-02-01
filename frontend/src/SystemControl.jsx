// frontend/src/SystemControl.jsx
import React, { useState, useEffect } from 'react';

// 1. UPDATE: Accept 'apiBase' as a prop
const SystemControl = ({ apiBase }) => {
    const [settings, setSettings] = useState({
        market_status: 'OPEN',
        simulated_date: new Date().toISOString().slice(0, 16)
    });
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');

    // Load settings when the component mounts (or when apiBase changes)
    useEffect(() => {
        if (apiBase) {
            fetchSettings();
        }
    }, [apiBase]);

    const fetchSettings = async () => {
        try {
            // 2. UPDATE: Use apiBase instead of localhost
            const response = await fetch(`${apiBase}/api/admin/settings`);
            const data = await response.json();
            
            const formattedDate = new Date(data.simulated_date).toISOString().slice(0, 16);
            
            setSettings({
                market_status: data.market_status,
                simulated_date: formattedDate
            });
        } catch (err) {
            console.error("Failed to load settings", err);
        }
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            // 3. UPDATE: Use apiBase here too
            const res = await fetch(`${apiBase}/api/admin/settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings)
            });
            
            if (res.ok) {
                setMessage('Settings Updated Successfully!');
            } else {
                setMessage('Error updating settings');
            }
            
            setTimeout(() => setMessage(''), 3000);
        } catch (err) {
            setMessage('Error updating settings');
        }
        setLoading(false);
    };

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
