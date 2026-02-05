import React, { useState, useEffect } from 'react';

const API_BASE = 'https://stock-trading-api-fcp5.onrender.com';

function AdminDashboard({ onBack, onLoginAs }) {
    const [activeTab, setActiveTab] = useState('stocks'); 
    
    // Data States
    const [users, setUsers] = useState([]);
    const [stocks, setStocks] = useState([]);
    const [settings, setSettings] = useState({ market_status: 'OPEN', simulated_date: '' });
    
    // Status Messages
    const [msg, setMsg] = useState('');
    const [stockMsg, setStockMsg] = useState('');

    // User Form State
    const [newUser, setNewUser] = useState('');
    const [newPass, setNewPass] = useState('');

    // Stock Form State
    const [newSymbol, setNewSymbol] = useState('');
    const [newName, setNewName] = useState('');
    const [newPrice, setNewPrice] = useState('');
    const [newVol, setNewVol] = useState('0.02');
    const [newSector, setNewSector] = useState('Tech');

    // --- INITIAL LOAD ---
    useEffect(() => {
        if (activeTab === 'users') fetchUsers();
        if (activeTab === 'stocks') fetchStocks();
        if (activeTab === 'settings') fetchSettings();
    }, [activeTab]);

    // --- FETCHERS ---
    const fetchUsers = async () => {
        try {
            const res = await fetch(`${API_BASE}/api/auth/users`);
            const data = await res.json();
            setUsers(Array.isArray(data) ? data : []);
        } catch (err) { console.error(err); }
    };

    const fetchStocks = async () => {
        try {
            const res = await fetch(`${API_BASE}/api/admin/stocks`);
            const data = await res.json();
            setStocks(Array.isArray(data) ? data : []);
        } catch (err) { console.error(err); }
    };

    const fetchSettings = async () => {
        try {
            const res = await fetch(`${API_BASE}/api/admin/settings`);
            const data = await res.json();
            setSettings(data);
        } catch (err) { console.error(err); }
    };

    // --- SYSTEM ACTIONS ---
    const handleGenerateHistory = async () => {
        if(!window.confirm("This will generate 1 year of price history. It takes about 10-20 seconds. Continue?")) return;
        setMsg('⏳ Generating History... Please wait...');
        try {
            const res = await fetch(`${API_BASE}/api/admin/generate-prices`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ year: 2026 })
            });
            const data = await res.json();
            if (res.ok) setMsg(`✅ Success: ${data.message}`);
            else setMsg(`❌ Error: ${data.error}`);
        } catch (err) { setMsg(`❌ Network Error: ${err.message}`); }
    };

    const updateSettings = async (newStatus) => {
        try {
            const res = await fetch(`${API_BASE}/api/admin/settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...settings, market_status: newStatus })
            });
            const data = await res.json();
            setSettings(data);
            setMsg(`System updated: Market is ${newStatus}`);
        } catch (err) { setMsg('Error updating settings'); }
    };

    // --- USER MANAGEMENT ---
    const toggleAdmin = async (userId, currentStatus) => {
        const newStatus = !currentStatus;
        setUsers(users.map(u => u.user_id === userId ? { ...u, is_admin: newStatus } : u));
        try {
            await fetch(`${API_BASE}/api/auth/users/${userId}/role`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isAdmin: newStatus })
            });
        } catch (err) { fetchUsers(); }
    };

    const handleCreateUser = async (e) => {
        e.preventDefault();
        setMsg('Creating user...');
        try {
            const res = await fetch(`${API_BASE}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: newUser, password: newPass, email: `${newUser}@example.com` })
            });
            if (res.ok) {
                setMsg(`✅ User ${newUser} created!`);
                setNewUser(''); setNewPass(''); 
            } else {
                const data = await res.json();
                setMsg(`❌ Error: ${data.error}`);
            }
        } catch (err) { setMsg(`❌ Error: ${err.message}`); }
    };

    // --- STOCK MANAGEMENT ---
    const handleCreateStock = async (e) => {
        e.preventDefault();
        setStockMsg('Adding stock...');
        try {
            const res = await fetch(`${API_BASE}/api/admin/stocks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symbol: newSymbol, name: newName, base_price: parseFloat(newPrice), volatility: parseFloat(newVol), sector: newSector })
            });
            if (res.ok) {
                setStockMsg('✅ Stock Added!');
                setNewSymbol(''); setNewName(''); setNewPrice(''); fetchStocks();
            } else {
                const d = await res.json(); setStockMsg(`❌ Error: ${d.error}`);
            }
        } catch (err) { console.error(err); }
    };

    const handleDeleteStock = async (ticker) => {
        if(!window.confirm(`Delete ${ticker}?`)) return;
        try { await fetch(`${API_BASE}/api/admin/stocks/${ticker}`, { method: 'DELETE' }); fetchStocks(); } catch(err) { console.error(err); }
    };

    // Inline Update (Restored)
    const handleUpdateStock = async (ticker, newVol, newBase, newSector) => {
        try {
            await fetch(`${API_BASE}/api/admin/stocks/${ticker}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ volatility: newVol, base_price: newBase, sector: newSector })
            });
            // Don't alert, just refresh silently or show toast
            console.log("Stock Updated");
        } catch(err) { console.error(err); }
    };

    return (
        <div style={{ padding: '30px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'sans-serif' }}>
            {/* HEADER */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
                <div>
                    <h1 style={{ margin: 0, color: '#333' }}>🔒 Admin<span style={{color:'#d32f2f'}}>Panel</span></h1>
                    <div style={{fontSize:'12px', color:'#666', marginTop:'5px'}}>System Status: <strong style={{color: settings.market_status==='OPEN'?'green':'red'}}>{settings.market_status}</strong></div>
                </div>
                <button onClick={onBack} style={btnSecondary}>← Back to Dashboard</button>
            </div>

            {/* STATUS MESSAGE */}
            {msg && <div style={{ padding: '15px', background: msg.includes('Error') ? '#f8d7da' : '#d4edda', color: msg.includes('Error') ? '#721c24' : '#155724', borderRadius: '4px', marginBottom: '20px', fontWeight: 'bold' }}>{msg}</div>}

            {/* NAVIGATION TABS */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '1px solid #ddd', paddingBottom: '10px' }}>
                <button onClick={() => setActiveTab('stocks')} style={activeTab === 'stocks' ? tabActive : tabInactive}>📈 Stocks</button>
                <button onClick={() => setActiveTab('users')} style={activeTab === 'users' ? tabActive : tabInactive}>👥 Users</button>
                <button onClick={() => setActiveTab('create')} style={activeTab === 'create' ? tabActive : tabInactive}>➕ Create User</button>
                <button onClick={() => setActiveTab('settings')} style={activeTab === 'settings' ? tabActive : tabInactive}>⚙️ Settings</button>
                <button onClick={() => setActiveTab('sql')} style={activeTab === 'sql' ? tabActive : tabInactive}>🛠 SQL Tool</button>
                
                {/* GENERATE HISTORY BUTTON */}
                <button onClick={handleGenerateHistory} style={{...btnSmall, marginLeft:'auto', background:'#6f42c1', fontSize:'14px', padding:'8px 16px', boxShadow:'0 2px 5px rgba(0,0,0,0.2)'}}>⚡ Generate History</button>
            </div>

            {/* --- TAB CONTENT --- */}

            {activeTab === 'stocks' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '20px' }}>
                    <div style={cardStyle}>
                        <h3>Add New Stock</h3>
                        <form onSubmit={handleCreateStock}>
                            <div style={formGroup}><label>Symbol</label><input style={inputStyle} value={newSymbol} onChange={e => setNewSymbol(e.target.value.toUpperCase())} required /></div>
                            <div style={formGroup}><label>Name</label><input style={inputStyle} value={newName} onChange={e => setNewName(e.target.value)} required /></div>
                            <div style={formGroup}><label>Price</label><input type="number" style={inputStyle} value={newPrice} onChange={e => setNewPrice(e.target.value)} required /></div>
                            <div style={formGroup}><label>Sector</label>
                                <select style={inputStyle} value={newSector} onChange={e => setNewSector(e.target.value)}>
                                    <option value="Tech">Tech</option><option value="Finance">Finance</option><option value="Health">Health</option><option value="Auto">Auto</option><option value="Energy">Energy</option><option value="Crypto">Crypto</option>
                                </select>
                            </div>
                            <div style={formGroup}><label>Volatility</label><input type="number" step="0.01" style={inputStyle} value={newVol} onChange={e => setNewVol(e.target.value)} required /></div>
                            <button type="submit" style={btnPrimary}>Add Stock</button>
                        </form>
                        {stockMsg && <div style={{marginTop:'10px', fontSize:'13px'}}>{stockMsg}</div>}
                    </div>

                    <div style={cardStyle}>
                        <h3>Current Market ({stocks.length})</h3>
                        <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead><tr style={{ textAlign: 'left', background: '#f8f9fa' }}><th style={thStyle}>Symbol</th><th style={thStyle}>Price</th><th style={thStyle}>Vol</th><th style={thStyle}>Actions</th></tr></thead>
                                <tbody>
                                    {stocks.map(s => (
                                        <tr key={s.ticker} style={{ borderBottom: '1px solid #eee' }}>
                                            <td style={tdStyle}><strong>{s.ticker}</strong><br/><span style={{fontSize:'12px', color:'#666'}}>{s.name}</span></td>
                                            <td style={tdStyle}>${s.current_price}</td>
                                            <td style={tdStyle}>
                                                <input 
                                                    type="number" step="0.01" 
                                                    defaultValue={s.volatility}
                                                    onBlur={(e) => handleUpdateStock(s.ticker, e.target.value, s.base_price, s.sector)}
                                                    style={{width: '60px', padding: '5px', border:'1px solid #ddd', borderRadius:'4px'}}
                                                />
                                            </td>
                                            <td style={tdStyle}><button onClick={() => handleDeleteStock(s.ticker)} style={{...btnSmall, background:'#dc3545'}}>Delete</button></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'users' && (
                <div style={cardStyle}>
                    <h3>User Management</h3>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead><tr style={{ background: '#f8f9fa', textAlign: 'left' }}><th style={thStyle}>Username</th><th style={thStyle}>Role</th><th style={thStyle}>Action</th></tr></thead>
                        <tbody>
                            {users.map(u => (
                                <tr key={u.user_id} style={{ borderBottom: '1px solid #eee' }}>
                                    <td style={tdStyle}>{u.username}</td>
                                    <td style={tdStyle}>
                                        <label style={{cursor:'pointer', display:'flex', alignItems:'center', gap:'5px'}}>
                                            <input type="checkbox" checked={u.is_admin || false} onChange={() => toggleAdmin(u.user_id, u.is_admin)} /> 
                                            {u.is_admin ? <span style={{color:'green', fontWeight:'bold'}}>Admin</span> : 'User'}
                                        </label>
                                    </td>
                                    <td style={tdStyle}><button onClick={() => onLoginAs(u)} style={btnSmall}>Login As</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {activeTab === 'create' && (
                <div style={{...cardStyle, maxWidth:'500px'}}>
                    <h3>Create New User</h3>
                    <form onSubmit={handleCreateUser}>
                        <div style={formGroup}><label>Username</label><input style={inputStyle} value={newUser} onChange={e => setNewUser(e.target.value)} required /></div>
                        <div style={formGroup}><label>Password</label><input style={inputStyle} value={newPass} onChange={e => setNewPass(e.target.value)} required /></div>
                        <button type="submit" style={btnPrimary}>Create User</button>
                    </form>
                </div>
            )}

            {activeTab === 'settings' && (
                <div style={cardStyle}>
                    <h3>System Control</h3>
                    <p>Manage the global simulation state.</p>
                    <div style={{display:'flex', gap:'20px', marginTop:'20px'}}>
                        <button onClick={() => updateSettings('OPEN')} style={{...btnBig, background: settings.market_status==='OPEN' ? '#28a745' : '#eee', color: settings.market_status==='OPEN'?'white':'#999'}}>Market OPEN</button>
                        <button onClick={() => updateSettings('CLOSED')} style={{...btnBig, background: settings.market_status==='CLOSED' ? '#dc3545' : '#eee', color: settings.market_status==='CLOSED'?'white':'#999'}}>Market CLOSED</button>
                    </div>
                </div>
            )}

            {activeTab === 'sql' && (
                <div style={{ height: '800px', background: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
                    <iframe src="/sql_tool.html" style={{ width: '100%', height: '100%', border: 'none' }} title="SQL Tool"></iframe>
                </div>
            )}
        </div>
    );
}

// --- STYLES ---
const btnPrimary = { padding: '10px 20px', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', width: '100%' };
const btnSecondary = { padding: '8px 16px', background: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' };
const btnSmall = { padding: '5px 10px', background: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' };
const btnBig = { padding: '20px', flex:1, border:'none', borderRadius:'8px', cursor:'pointer', fontWeight:'bold', fontSize:'18px' };
const tabActive = { padding: '10px 20px', background: '#333', color: 'white', border: 'none', borderRadius: '4px 4px 0 0', cursor: 'pointer' };
const tabInactive = { padding: '10px 20px', background: 'none', color: '#666', border: 'none', cursor: 'pointer' };
const thStyle = { padding: '12px', borderBottom: '2px solid #ddd' };
const tdStyle = { padding: '12px', color: '#333' };
const inputStyle = { width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' };
const cardStyle = { background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' };
const formGroup = { marginBottom: '15px' };

export default AdminDashboard;
