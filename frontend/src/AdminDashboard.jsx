import React, { useState, useEffect } from 'react';
import SystemControl from './SystemControl';

// POINT TO YOUR BACKEND
const API_BASE = 'https://stock-trading-api-fcp5.onrender.com';

function AdminDashboard({ onBack, onLoginAs }) {
    const [activeTab, setActiveTab] = useState('stocks'); // Default to stocks for now
    
    // Data States
    const [users, setUsers] = useState([]);
    const [stocks, setStocks] = useState([]);
    
    // User Form State
    const [newUser, setNewUser] = useState('');
    const [newPass, setNewPass] = useState('');
    const [msg, setMsg] = useState('');

    // Stock Form State
    const [newSymbol, setNewSymbol] = useState('');
    const [newName, setNewName] = useState('');
    const [newPrice, setNewPrice] = useState('');
    const [newVol, setNewVol] = useState('0.02');
    const [newSector, setNewSector] = useState('Tech');
    const [stockMsg, setStockMsg] = useState('');

    useEffect(() => {
        if (activeTab === 'users') fetchUsers();
        if (activeTab === 'stocks') fetchStocks();
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

    // --- USER ACTIONS ---
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
        setMsg('Creating...');
        try {
            const res = await fetch(`${API_BASE}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: newUser, password: newPass, email: `${newUser}@example.com` })
            });
            const data = await res.json();
            if (res.ok) {
                setMsg(`✅ User ${newUser} created!`);
                setNewUser(''); setNewPass(''); fetchUsers();
            } else {
                setMsg(`❌ Error: ${data.error}`);
            }
        } catch (err) { setMsg(`❌ Network Error: ${err.message}`); }
    };

    // --- STOCK ACTIONS ---
    const handleCreateStock = async (e) => {
        e.preventDefault();
        setStockMsg('Adding stock...');
        try {
            const res = await fetch(`${API_BASE}/api/admin/stocks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    symbol: newSymbol,
                    name: newName,
                    base_price: parseFloat(newPrice),
                    volatility: parseFloat(newVol),
                    sector: newSector
                })
            });
            if (res.ok) {
                setStockMsg('✅ Stock Added!');
                setNewSymbol(''); setNewName(''); setNewPrice('');
                fetchStocks();
            } else {
                const d = await res.json();
                setStockMsg(`❌ Error: ${d.error}`);
            }
        } catch (err) { console.error(err); }
    };

    const handleDeleteStock = async (symbol) => {
        if(!window.confirm(`Delete ${symbol}?`)) return;
        try {
            await fetch(`${API_BASE}/api/admin/stocks/${symbol}`, { method: 'DELETE' });
            fetchStocks();
        } catch(err) { console.error(err); }
    };

    const handleUpdateStock = async (symbol, newVol, newBase, newSector) => {
        try {
            await fetch(`${API_BASE}/api/admin/stocks/${symbol}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ volatility: newVol, base_price: newBase, sector: newSector })
            });
            alert('Stock Updated');
            fetchStocks();
        } catch(err) { console.error(err); }
    };

    return (
        <div style={{ padding: '30px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'sans-serif' }}>
            
            {/* HEADER */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
                <h1 style={{ margin: 0, color: '#333' }}>🔒 Admin<span style={{color:'#d32f2f'}}>Panel</span></h1>
                <button onClick={onBack} style={btnSecondary}>← Back to Dashboard</button>
            </div>

            {/* SYSTEM CONTROL WIDGET */}
            <SystemControl apiBase={API_BASE} />

            {/* TABS */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '1px solid #ddd', paddingBottom: '10px' }}>
                <button onClick={() => setActiveTab('stocks')} style={activeTab === 'stocks' ? tabActive : tabInactive}>📈 Stock Management</button>
                <button onClick={() => setActiveTab('users')} style={activeTab === 'users' ? tabActive : tabInactive}>👥 User Management</button>
                <button onClick={() => setActiveTab('create')} style={activeTab === 'create' ? tabActive : tabInactive}>➕ Create User</button>
                <button onClick={() => setActiveTab('sql')} style={activeTab === 'sql' ? tabActive : tabInactive}>🛠 SQL Tool</button>
            </div>

            {/* --- TAB: STOCK MANAGEMENT --- */}
            {activeTab === 'stocks' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '20px' }}>
                    {/* LEFT: ADD STOCK FORM */}
                    <div style={cardStyle}>
                        <h3>Add New Stock</h3>
                        <form onSubmit={handleCreateStock}>
                            <div style={formGroup}>
                                <label>Symbol (e.g., AAPL)</label>
                                <input style={inputStyle} value={newSymbol} onChange={e => setNewSymbol(e.target.value.toUpperCase())} required />
                            </div>
                            <div style={formGroup}>
                                <label>Company Name</label>
                                <input style={inputStyle} value={newName} onChange={e => setNewName(e.target.value)} required />
                            </div>
                            <div style={formGroup}>
                                <label>Base Price ($)</label>
                                <input type="number" style={inputStyle} value={newPrice} onChange={e => setNewPrice(e.target.value)} required />
                            </div>
                            <div style={formGroup}>
                                <label>Sector</label>
                                <select style={inputStyle} value={newSector} onChange={e => setNewSector(e.target.value)}>
                                    <option value="Tech">Tech</option>
                                    <option value="Finance">Finance</option>
                                    <option value="Health">Health</option>
                                    <option value="Auto">Auto</option>
                                    <option value="Energy">Energy</option>
                                </select>
                            </div>
                            <div style={formGroup}>
                                <label>Volatility (0.01 - 0.10)</label>
                                <input type="number" step="0.01" style={inputStyle} value={newVol} onChange={e => setNewVol(e.target.value)} required />
                            </div>
                            <button type="submit" style={btnPrimary}>Add Stock</button>
                        </form>
                        {stockMsg && <p>{stockMsg}</p>}
                    </div>

                    {/* RIGHT: STOCK LIST */}
                    <div style={cardStyle}>
                        <h3>Current Market Pool ({stocks.length})</h3>
                        <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ textAlign: 'left', background: '#f8f9fa' }}>
                                        <th style={thStyle}>Symbol</th>
                                        <th style={thStyle}>Price</th>
                                        <th style={thStyle}>Vol</th>
                                        <th style={thStyle}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {stocks.map(s => (
                                        <tr key={s.symbol} style={{ borderBottom: '1px solid #eee' }}>
                                            <td style={tdStyle}>
                                                <strong>{s.symbol}</strong><br/>
                                                <span style={{fontSize:'12px', color:'#666'}}>{s.name}</span>
                                            </td>
                                            <td style={tdStyle}>${s.current_price}</td>
                                            <td style={tdStyle}>
                                                <input 
                                                    type="number" 
                                                    step="0.01" 
                                                    defaultValue={s.volatility}
                                                    onBlur={(e) => handleUpdateStock(s.symbol, e.target.value, s.base_price, s.sector)}
                                                    style={{width: '60px', padding: '5px'}}
                                                />
                                            </td>
                                            <td style={tdStyle}>
                                                <button onClick={() => handleDeleteStock(s.symbol)} style={{...btnSmall, background:'#dc3545'}}>Delete</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* --- TAB: USERS --- */}
            {activeTab === 'users' && (
                <div style={cardStyle}>
                    <h3 style={{ marginTop: 0 }}>System Users ({users.length})</h3>
                    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '15px' }}>
                        <thead>
                            <tr style={{ background: '#f8f9fa', textAlign: 'left' }}>
                                <th style={thStyle}>ID</th>
                                <th style={thStyle}>Username</th>
                                <th style={thStyle}>Is Admin?</th>
                                <th style={thStyle}>Created Date</th>
                                <th style={thStyle}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map(u => (
                                <tr key={u.user_id} style={{ borderBottom: '1px solid #eee' }}>
                                    <td style={tdStyle}>{u.user_id}</td>
                                    <td style={{...tdStyle, fontWeight:'bold'}}>{u.username}</td>
                                    <td style={tdStyle}>
                                        <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                            <input 
                                                type="checkbox" 
                                                checked={u.is_admin || false} 
                                                onChange={() => toggleAdmin(u.user_id, u.is_admin)} 
                                            />
                                            {u.is_admin ? <span style={{color:'green', fontWeight:'bold'}}>Admin</span> : <span style={{color:'#999'}}>User</span>}
                                        </label>
                                    </td>
                                    <td style={tdStyle}>{new Date(u.created_at).toLocaleDateString()}</td>
                                    <td style={tdStyle}>
                                        <button onClick={() => onLoginAs(u)} style={btnSmall}>👁 View Dashboard</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* --- TAB: CREATE USER --- */}
            {activeTab === 'create' && (
                <div style={{ ...cardStyle, maxWidth: '500px' }}>
                    <h3 style={{ marginTop: 0 }}>Create New User</h3>
                    <form onSubmit={handleCreateUser}>
                        <div style={{ marginBottom: '15px' }}>
                            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>Username</label>
                            <input type="text" value={newUser} onChange={e => setNewUser(e.target.value)} style={inputStyle} required />
                        </div>
                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>Password</label>
                            <input type="text" value={newPass} onChange={e => setNewPass(e.target.value)} style={inputStyle} required />
                        </div>
                        <button type="submit" style={btnPrimary}>Create User</button>
                    </form>
                    {msg && <div style={{ marginTop: '15px', padding: '10px', background: '#f0f2f5', borderRadius: '4px' }}>{msg}</div>}
                </div>
            )}

            {/* --- TAB: SQL TOOL --- */}
            {activeTab === 'sql' && (
                <div style={{ height: '800px', background: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
                    <iframe src="/sql_tool.html" style={{ width: '100%', height: '100%', border: 'none' }} title="SQL Tool"></iframe>
                </div>
            )}
        </div>
    );
}

// Styles
const btnPrimary = { padding: '10px 20px', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', width: '100%' };
const btnSecondary = { padding: '8px 16px', background: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' };
const btnSmall = { padding: '5px 10px', background: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' };
const tabActive = { padding: '10px 20px', background: '#333', color: 'white', border: 'none', borderRadius: '4px 4px 0 0', cursor: 'pointer' };
const tabInactive = { padding: '10px 20px', background: 'none', color: '#666', border: 'none', cursor: 'pointer' };
const thStyle = { padding: '12px', borderBottom: '2px solid #ddd' };
const tdStyle = { padding: '12px', color: '#333' };
const inputStyle = { width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' };
const cardStyle = { background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' };
const formGroup = { marginBottom: '15px' };

export default AdminDashboard;
