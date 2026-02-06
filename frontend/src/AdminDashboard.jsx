import React, { useState, useEffect } from 'react';

const API_BASE = 'https://stock-trading-api-fcp5.onrender.com';

function AdminDashboard({ onBack, onLoginAs }) {
    // Helper: format UTC date as readable market time
    const formatMarketTime = (dateStr) => {
        if (!dateStr) return 'Not set';
        const d = new Date(dateStr);
        const month = d.getUTCMonth() + 1;
        const day = d.getUTCDate();
        const year = d.getUTCFullYear();
        let hours = d.getUTCHours();
        const mins = String(d.getUTCMinutes()).padStart(2, '0');
        const secs = String(d.getUTCSeconds()).padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12;
        const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
        const dayName = days[d.getUTCDay()];
        return `${dayName}, ${month}/${day}/${year} ${hours}:${mins}:${secs} ${ampm}`;
    };
    // --- STATE MANAGEMENT ---
    const [activeTab, setActiveTab] = useState('stocks'); 
    const [users, setUsers] = useState([]);
    const [stocks, setStocks] = useState([]);
    const [settings, setSettings] = useState({ market_status: 'OPEN', simulated_date: new Date().toISOString(), market_open_time: '09:30', market_close_time: '16:00', force_override: false, holidays: '[]' });
    const [marketCheckResult, setMarketCheckResult] = useState(null);
    
    // UI State
    const [msg, setMsg] = useState('');
    const [stockMsg, setStockMsg] = useState('');
    const [sqlOutput, setSqlOutput] = useState(null); 
    const [customDate, setCustomDate] = useState(''); // For Calendar Input

    // Holiday Form
    const [newHolidayDate, setNewHolidayDate] = useState('');
    const [newHolidayName, setNewHolidayName] = useState('');

    // Forms
    const [newUser, setNewUser] = useState('');
    const [newPass, setNewPass] = useState('');
    const [newSymbol, setNewSymbol] = useState('');
    const [newName, setNewName] = useState('');
    const [newPrice, setNewPrice] = useState('');
    const [newVol, setNewVol] = useState('0.02');
    const [newSector, setNewSector] = useState('Tech');
    const [newVolume, setNewVolume] = useState('1000000');
    const [newFullName, setNewFullName] = useState('');

    // --- INITIAL DATA LOAD ---
    useEffect(() => {
        fetchSettings(); // Always get system status
        fetchMarketCheck();
        if (activeTab === 'users') fetchUsers();
        if (activeTab === 'stocks') fetchStocks();
    }, [activeTab]);

    // --- API HANDLERS ---
    const fetchUsers = async () => {
        try { const res = await fetch(`${API_BASE}/api/auth/users`); setUsers(await res.json()); } catch (err) { console.error(err); }
    };
    const fetchStocks = async () => {
        try { const res = await fetch(`${API_BASE}/api/admin/stocks`); setStocks(await res.json()); } catch (err) { console.error(err); }
    };
    const fetchSettings = async () => {
        try { const res = await fetch(`${API_BASE}/api/admin/settings`); setSettings(await res.json()); } catch (err) { console.error(err); }
    };
    const fetchMarketCheck = async () => {
        try { const res = await fetch(`${API_BASE}/api/admin/market-check`); setMarketCheckResult(await res.json()); } catch (err) { console.error(err); }
    };

    // --- SYSTEM CONTROLS (TIME & MARKET) ---
    const updateSettings = async (updates) => {
        try {
            const res = await fetch(`${API_BASE}/api/admin/settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...settings, ...updates })
            });
            const data = await res.json();
            setSettings(data);
            setMsg('✅ System Settings Updated');
            // Re-check market status after any settings change
            fetchMarketCheck();
        } catch (err) { setMsg('❌ Error updating settings'); }
    };

    const handleDateChange = () => {
        if(customDate) {
            // Store raw datetime-local value as UTC — what admin picks IS the market time
            updateSettings({ simulated_date: customDate + ':00.000Z' });
        }
    };

    const advanceTime = (hours) => {
        const currentDate = new Date(settings.simulated_date || Date.now());
        currentDate.setUTCHours(currentDate.getUTCHours() + hours);
        updateSettings({ simulated_date: currentDate.toISOString() });
    };

    // --- HOLIDAY MANAGEMENT ---
    const getHolidays = () => {
        try { return JSON.parse(settings.holidays || '[]'); } catch(e) { return []; }
    };

    const addHoliday = () => {
        if (!newHolidayDate) return;
        const holidays = getHolidays();
        // Prevent duplicates
        if (holidays.find(h => h.date === newHolidayDate)) {
            setMsg('❌ Holiday already exists for that date');
            return;
        }
        holidays.push({ date: newHolidayDate, name: newHolidayName || 'Holiday' });
        holidays.sort((a, b) => a.date.localeCompare(b.date));
        updateSettings({ holidays: JSON.stringify(holidays) });
        setNewHolidayDate('');
        setNewHolidayName('');
    };

    const removeHoliday = (dateToRemove) => {
        const holidays = getHolidays().filter(h => h.date !== dateToRemove);
        updateSettings({ holidays: JSON.stringify(holidays) });
    };

    // --- HISTORY GENERATOR ---
    const handleGenerateHistory = async () => {
        if(!window.confirm("This will regenerate 1 year of end-of-day close prices for ALL stocks in the market. Existing price history will be replaced. Continue?")) return;
        setStockMsg('⏳ Generating 1-year price history for all stocks... Please wait...');
        try {
            const res = await fetch(`${API_BASE}/api/admin/generate-prices`, { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ days: 365 }) 
            });
            const data = await res.json();
            if (res.ok) setStockMsg(`✅ ${data.message}`); else setStockMsg(`❌ Error: ${data.error}`);
        } catch (err) { setStockMsg(`❌ Network Error: ${err.message}`); }
    };

    // --- SQL TOOL ---
    const runQuickSql = async (query) => {
        try { 
            const res = await fetch(`${API_BASE}/api/admin/run-sql`, { 
                method: 'POST', 
                headers: {'Content-Type': 'application/json'}, 
                body: JSON.stringify({ query }) 
            }); 
            setSqlOutput(await res.json()); 
        } catch (err) { setSqlOutput({ error: err.message }); }
    };

    // --- ENTITY MANAGEMENT ---
    const handleCreateUser = async (e) => {
        e.preventDefault();
        try { const res = await fetch(`${API_BASE}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: newUser, password: newPass, email: `${newUser}@example.com`, full_name: newFullName }) }); if (res.ok) { setMsg(`✅ User ${newUser} created!`); setNewUser(''); setNewPass(''); setNewFullName(''); } else { setMsg(`❌ Error`); } } catch (err) { setMsg(`❌ Error: ${err.message}`); }
    };
    const handleCreateStock = async (e) => {
        e.preventDefault();
        try { const res = await fetch(`${API_BASE}/api/admin/stocks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: newSymbol, name: newName, base_price: parseFloat(newPrice), volatility: parseFloat(newVol), sector: newSector, volume: parseInt(newVolume) || 0 }) }); if (res.ok) { setStockMsg('✅ Added!'); setNewSymbol(''); setNewName(''); setNewPrice(''); setNewVolume('1000000'); fetchStocks(); } } catch (err) { }
    };
    const toggleAdmin = async (userId, currentStatus) => {
        try { await fetch(`${API_BASE}/api/auth/users/${userId}/role`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isAdmin: !currentStatus }) }); fetchUsers(); } catch (err) { }
    };
    const deleteUser = async (userId, username) => {
        if (!window.confirm(`Delete user "${username}" and ALL their data (holdings, transactions, wallet)? This cannot be undone.`)) return;
        try {
            const res = await fetch(`${API_BASE}/api/auth/users/${userId}`, { method: 'DELETE' });
            if (res.ok) { setMsg(`✅ User "${username}" deleted`); fetchUsers(); }
            else { const data = await res.json(); setMsg(`❌ ${data.error}`); }
        } catch (err) { setMsg(`❌ Error: ${err.message}`); }
    };
    const handleDeleteStock = async (ticker) => { if(!window.confirm('Delete?')) return; try { await fetch(`${API_BASE}/api/admin/stocks/${ticker}`, { method: 'DELETE' }); fetchStocks(); } catch(err) {} };
    const handleUpdateStock = async (ticker, newVol, newBase, newSector) => { try { await fetch(`${API_BASE}/api/admin/stocks/${ticker}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ volatility: newVol, base_price: newBase, sector: newSector }) }); } catch(err) {} };

    // --- RENDER ---
    return (
        <div style={{ padding: '30px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'sans-serif' }}>
            {/* TOP HEADER */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '30px' }}>
                <div>
                    <h1 style={{ margin: '0 0 10px 0', color: '#333' }}>🔒 Admin<span style={{color:'#d32f2f'}}>Panel</span></h1>
                    <div style={{ background:'white', padding:'10px 20px', borderRadius:'8px', boxShadow:'0 1px 3px rgba(0,0,0,0.1)', display:'flex', alignItems:'center', gap:'15px' }}>
                        <div style={{textAlign:'right'}}>
                            <div style={{fontSize:'10px', color:'#666', textTransform:'uppercase'}}>Market Status</div>
                            <div style={{fontWeight:'bold', color: settings.market_status==='OPEN'?'#28a745':'#dc3545'}}>{settings.market_status}</div>
                        </div>
                        <div style={{height:'30px', width:'1px', background:'#eee'}}></div>
                        <div>
                            <div style={{fontSize:'10px', color:'#666', textTransform:'uppercase'}}>Mode</div>
                            <div style={{fontWeight:'bold', fontSize:'13px', color: settings.force_override ? '#d39e00' : '#007bff'}}>{settings.force_override ? '🔒 Force Override' : '🤖 Auto Schedule'}</div>
                        </div>
                        <div style={{height:'30px', width:'1px', background:'#eee'}}></div>
                        <div>
                            <div style={{fontSize:'10px', color:'#666', textTransform:'uppercase'}}>Simulated Time</div>
                            <div style={{fontWeight:'bold', fontSize:'14px'}}>{formatMarketTime(settings.simulated_date)}</div>
                        </div>
                        {marketCheckResult && (
                            <>
                                <div style={{height:'30px', width:'1px', background:'#eee'}}></div>
                                <div>
                                    <div style={{fontSize:'10px', color:'#666', textTransform:'uppercase'}}>Reason</div>
                                    <div style={{fontSize:'12px', color:'#555'}}>{marketCheckResult.reason}</div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
                <div style={{display:'flex', gap:'10px', flexDirection:'column', alignItems:'flex-end'}}>
                    <button onClick={onBack} style={{ padding: '8px 16px', background: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>← Back to Dashboard</button>
                </div>
            </div>

            {msg && <div style={{ padding: '15px', background: msg.includes('Error') ? '#f8d7da' : '#d4edda', color: msg.includes('Error') ? '#721c24' : '#155724', borderRadius: '4px', marginBottom: '20px', fontWeight: 'bold' }}>{msg}</div>}

            {/* TAB NAVIGATION */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '1px solid #ddd', paddingBottom: '10px' }}>
                <button onClick={() => setActiveTab('stocks')} style={{ padding: '10px 20px', background: activeTab === 'stocks' ? '#333' : 'none', color: activeTab === 'stocks' ? 'white' : '#666', border: 'none', borderRadius: '4px 4px 0 0', cursor: 'pointer' }}>📈 Stocks</button>
                <button onClick={() => setActiveTab('users')} style={{ padding: '10px 20px', background: activeTab === 'users' ? '#333' : 'none', color: activeTab === 'users' ? 'white' : '#666', border: 'none', borderRadius: '4px 4px 0 0', cursor: 'pointer' }}>👥 Users</button>
                <button onClick={() => setActiveTab('create')} style={{ padding: '10px 20px', background: activeTab === 'create' ? '#333' : 'none', color: activeTab === 'create' ? 'white' : '#666', border: 'none', borderRadius: '4px 4px 0 0', cursor: 'pointer' }}>➕ Create User</button>
                <button onClick={() => setActiveTab('settings')} style={{ padding: '10px 20px', background: activeTab === 'settings' ? '#333' : 'none', color: activeTab === 'settings' ? 'white' : '#666', border: 'none', borderRadius: '4px 4px 0 0', cursor: 'pointer' }}>⚙️ System Control</button>
                <button onClick={() => setActiveTab('sql')} style={{ padding: '10px 20px', background: activeTab === 'sql' ? '#333' : 'none', color: activeTab === 'sql' ? 'white' : '#666', border: 'none', borderRadius: '4px 4px 0 0', cursor: 'pointer' }}>🛠 SQL Tool</button>
            </div>

            {/* TAB CONTENT */}

            {activeTab === 'stocks' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '20px' }}>
                    <div style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                        <h3>Add New Stock</h3>
                        <form onSubmit={handleCreateStock}>
                            <div style={{ marginBottom: '15px' }}><label>Symbol</label><input style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }} value={newSymbol} onChange={e => setNewSymbol(e.target.value.toUpperCase())} required /></div>
                            <div style={{ marginBottom: '15px' }}><label>Name</label><input style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }} value={newName} onChange={e => setNewName(e.target.value)} required /></div>
                            <div style={{ marginBottom: '15px' }}><label>Price</label><input type="number" style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }} value={newPrice} onChange={e => setNewPrice(e.target.value)} required /></div>
                            <div style={{ marginBottom: '15px' }}><label>Sector</label><select style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }} value={newSector} onChange={e => setNewSector(e.target.value)}><option value="Tech">Tech</option><option value="Finance">Finance</option><option value="Health">Health</option><option value="Auto">Auto</option><option value="Energy">Energy</option><option value="Crypto">Crypto</option></select></div>
                            <div style={{ marginBottom: '15px' }}><label>Volatility</label><input type="number" step="0.01" style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }} value={newVol} onChange={e => setNewVol(e.target.value)} required /></div>
                            <div style={{ marginBottom: '15px' }}><label>Volume (Total Shares)</label><input type="number" style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }} value={newVolume} onChange={e => setNewVolume(e.target.value)} placeholder="e.g. 1000000" required /></div>
                            <button type="submit" style={{ padding: '10px 20px', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', width: '100%' }}>Add Stock</button>
                        </form>
                        
                        {/* Generate History Section */}
                        <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '2px solid #e1e4e8' }}>
                            <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#333' }}>📊 Price History</h4>
                            <p style={{ fontSize: '12px', color: '#666', marginBottom: '12px', lineHeight: '1.4' }}>
                                Generate 1 year of end-of-day close prices for <strong>all {stocks.length} stocks</strong> in the market. Run this after adding new stocks.
                            </p>
                            <button onClick={handleGenerateHistory} style={{ padding: '10px 20px', background: '#6f42c1', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', width: '100%', fontSize: '13px' }}>⚡ Generate 1-Year History (All Stocks)</button>
                            {stockMsg && <div style={{ marginTop: '10px', padding: '8px 12px', background: stockMsg.includes('✅') ? '#d4edda' : stockMsg.includes('⏳') ? '#fff3cd' : '#f8d7da', color: stockMsg.includes('✅') ? '#155724' : stockMsg.includes('⏳') ? '#856404' : '#721c24', borderRadius: '4px', fontSize: '12px', fontWeight: '500' }}>{stockMsg}</div>}
                        </div>
                    </div>
                    <div style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                        <h3>Current Market ({stocks.length})</h3>
                        <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead><tr style={{ textAlign: 'left', background: '#f8f9fa' }}><th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Symbol</th><th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Price</th><th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Vol</th><th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Volume</th><th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Actions</th></tr></thead>
                                <tbody>
                                    {stocks.map(s => (
                                        <tr key={s.ticker} style={{ borderBottom: '1px solid #eee' }}>
                                            <td style={{ padding: '12px', color: '#333' }}><strong>{s.ticker}</strong><br/><span style={{fontSize:'12px', color:'#666'}}>{s.name}</span></td>
                                            <td style={{ padding: '12px', color: '#333' }}>${s.current_price}</td>
                                            <td style={{ padding: '12px', color: '#333' }}><input type="number" step="0.01" defaultValue={s.volatility} onBlur={(e) => handleUpdateStock(s.ticker, e.target.value, s.base_price, s.sector)} style={{width: '60px', padding: '5px', border:'1px solid #ddd', borderRadius:'4px'}} /></td>
                                            <td style={{ padding: '12px', color: '#333', fontSize: '12px' }}>{s.volume ? Number(s.volume).toLocaleString() : '0'}</td>
                                            <td style={{ padding: '12px', color: '#333' }}><button onClick={() => handleDeleteStock(s.ticker)} style={{ padding: '5px 10px', background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Delete</button></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'users' && (
                <div style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                    <h3>User Management</h3>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead><tr style={{ background: '#f8f9fa', textAlign: 'left' }}><th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Username</th><th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Full Name</th><th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Role</th><th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Action</th></tr></thead>
                        <tbody>
                            {users.map(u => (
                                <tr key={u.user_id} style={{ borderBottom: '1px solid #eee' }}>
                                    <td style={{ padding: '12px', color: '#333' }}>{u.username}</td>
                                    <td style={{ padding: '12px', color: '#666' }}>{u.full_name || '—'}</td>
                                    <td style={{ padding: '12px', color: '#333' }}><label style={{cursor:'pointer', display:'flex', alignItems:'center', gap:'5px'}}><input type="checkbox" checked={u.is_admin || false} onChange={() => toggleAdmin(u.user_id, u.is_admin)} /> {u.is_admin ? <span style={{color:'green', fontWeight:'bold'}}>Admin</span> : 'User'}</label></td>
                                    <td style={{ padding: '12px', color: '#333' }}><button onClick={() => onLoginAs(u)} style={{ padding: '5px 10px', background: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', marginRight: '6px' }}>Login As</button><button onClick={() => deleteUser(u.user_id, u.username)} style={{ padding: '5px 10px', background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Delete</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {activeTab === 'create' && (
                <div style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', maxWidth:'500px' }}>
                    <h3>Create New User</h3>
                    <form onSubmit={handleCreateUser}>
                        <div style={{ marginBottom: '15px' }}><label>Full Name</label><input style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }} value={newFullName} onChange={e => setNewFullName(e.target.value)} placeholder="John Smith" required /></div>
                        <div style={{ marginBottom: '15px' }}><label>Username</label><input style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }} value={newUser} onChange={e => setNewUser(e.target.value)} required /></div>
                        <div style={{ marginBottom: '15px' }}><label>Password</label><input style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }} value={newPass} onChange={e => setNewPass(e.target.value)} required /></div>
                        <button type="submit" style={{ padding: '10px 20px', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', width: '100%' }}>Create User</button>
                    </form>
                </div>
            )}

            {activeTab === 'settings' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    
                    {/* LEFT COLUMN: Market Controls */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        
                        {/* Force Override Toggle */}
                        <div style={{ background: 'white', padding: '25px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderTop: settings.force_override ? '4px solid #ffc107' : '4px solid #007bff' }}>
                            <h3 style={{ margin: '0 0 5px 0', fontSize: '16px' }}>Market Mode</h3>
                            <p style={{ color: '#666', fontSize: '13px', marginBottom: '15px' }}>
                                {settings.force_override 
                                    ? '🔒 Force Override — You control the market status manually.' 
                                    : '🤖 Auto Schedule — Market opens/closes based on hours, weekdays, and holidays.'}
                            </p>
                            <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                                <button onClick={() => updateSettings({ force_override: false })} style={{ flex: 1, padding: '12px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', background: !settings.force_override ? '#007bff' : '#eee', color: !settings.force_override ? 'white' : '#999' }}>🤖 Auto Schedule</button>
                                <button onClick={() => updateSettings({ force_override: true })} style={{ flex: 1, padding: '12px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', background: settings.force_override ? '#ffc107' : '#eee', color: settings.force_override ? '#000' : '#999' }}>🔒 Force Override</button>
                            </div>

                            {/* Show OPEN/CLOSED buttons only when force override is on */}
                            {settings.force_override && (
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <button onClick={() => updateSettings({ market_status: 'OPEN' })} style={{ flex: 1, padding: '16px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px', background: settings.market_status === 'OPEN' ? '#28a745' : '#eee', color: settings.market_status === 'OPEN' ? 'white' : '#999' }}>✅ FORCE OPEN</button>
                                    <button onClick={() => updateSettings({ market_status: 'CLOSED' })} style={{ flex: 1, padding: '16px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px', background: settings.market_status === 'CLOSED' ? '#dc3545' : '#eee', color: settings.market_status === 'CLOSED' ? 'white' : '#999' }}>🚫 FORCE CLOSED</button>
                                </div>
                            )}
                        </div>

                        {/* Market Hours */}
                        <div style={{ background: 'white', padding: '25px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                            <h3 style={{ margin: '0 0 5px 0', fontSize: '16px' }}>⏰ Trading Hours</h3>
                            <p style={{ color: '#666', fontSize: '13px', marginBottom: '15px' }}>Set when the market opens and closes each weekday.</p>
                            <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-end' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#666', marginBottom: '5px', textTransform: 'uppercase' }}>Open</label>
                                    <input type="time" value={settings.market_open_time || '09:30'} onChange={e => updateSettings({ market_open_time: e.target.value })} style={{ width: '100%', padding: '10px', border: '1px solid #ccc', borderRadius: '6px', fontSize: '16px', boxSizing: 'border-box' }} />
                                </div>
                                <div style={{ fontSize: '20px', color: '#ccc', paddingBottom: '10px' }}>→</div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#666', marginBottom: '5px', textTransform: 'uppercase' }}>Close</label>
                                    <input type="time" value={settings.market_close_time || '16:00'} onChange={e => updateSettings({ market_close_time: e.target.value })} style={{ width: '100%', padding: '10px', border: '1px solid #ccc', borderRadius: '6px', fontSize: '16px', boxSizing: 'border-box' }} />
                                </div>
                            </div>
                            <div style={{ marginTop: '10px', fontSize: '12px', color: '#999' }}>
                                Currently: {settings.market_open_time || '09:30'} — {settings.market_close_time || '16:00'} (Mon–Fri)
                            </div>
                        </div>

                        {/* Time Machine */}
                        <div style={{ background: 'white', padding: '25px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                            <h3 style={{ margin: '0 0 5px 0', fontSize: '16px' }}>🕐 Time Machine</h3>
                            <p style={{ color: '#666', fontSize: '13px', marginBottom: '15px' }}>Jump forward in simulated time, or pick a specific date.</p>
                            <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                                <button onClick={() => advanceTime(1)} style={{ flex: 1, padding: '10px', background: '#6c757d', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>+1 Hour</button>
                                <button onClick={() => advanceTime(24)} style={{ flex: 1, padding: '10px', background: '#6c757d', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>+1 Day</button>
                                <button onClick={() => advanceTime(168)} style={{ flex: 1, padding: '10px', background: '#6c757d', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>+1 Week</button>
                            </div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#666', marginBottom: '5px', textTransform: 'uppercase' }}>Jump to Specific Date & Time</label>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <input type="datetime-local" value={customDate} onChange={(e) => setCustomDate(e.target.value)} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '14px' }} />
                                <button onClick={handleDateChange} style={{ padding: '10px 20px', background: '#007bff', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', whiteSpace: 'nowrap' }}>Set Date</button>
                            </div>
                            <div style={{ marginTop: '10px', fontSize: '12px', color: '#999' }}>
                                Current simulated time: <strong>{formatMarketTime(settings.simulated_date)}</strong>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT COLUMN: Holidays */}
                    <div style={{ background: 'white', padding: '25px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', alignSelf: 'start' }}>
                        <h3 style={{ margin: '0 0 5px 0', fontSize: '16px' }}>📅 Market Holidays</h3>
                        <p style={{ color: '#666', fontSize: '13px', marginBottom: '15px' }}>The market will be automatically closed on these dates (when in Auto Schedule mode).</p>
                        
                        {/* Add Holiday Form */}
                        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', padding: '15px', background: '#f8f9fa', borderRadius: '8px' }}>
                            <div style={{ flex: 1 }}>
                                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#666', marginBottom: '4px', textTransform: 'uppercase' }}>Date</label>
                                <input type="date" value={newHolidayDate} onChange={e => setNewHolidayDate(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#666', marginBottom: '4px', textTransform: 'uppercase' }}>Name</label>
                                <input type="text" value={newHolidayName} onChange={e => setNewHolidayName(e.target.value)} placeholder="e.g. Independence Day" style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }} />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                                <button onClick={addHoliday} style={{ padding: '8px 16px', background: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', whiteSpace: 'nowrap' }}>+ Add</button>
                            </div>
                        </div>

                        {/* Holiday List */}
                        <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                            {getHolidays().length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '30px', color: '#999' }}>
                                    <div style={{ fontSize: '30px', marginBottom: '10px' }}>📅</div>
                                    <p>No holidays set. Add some above.</p>
                                </div>
                            ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                                    <thead>
                                        <tr style={{ background: '#f8f9fa', borderBottom: '2px solid #e1e4e8' }}>
                                            <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: '12px', color: '#666' }}>Date</th>
                                            <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: '12px', color: '#666' }}>Holiday Name</th>
                                            <th style={{ textAlign: 'right', padding: '10px 12px', fontSize: '12px', color: '#666' }}>Remove</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {getHolidays().map(h => (
                                            <tr key={h.date} style={{ borderBottom: '1px solid #eee' }}>
                                                <td style={{ padding: '10px 12px', fontWeight: 'bold' }}>{h.date}</td>
                                                <td style={{ padding: '10px 12px' }}>{h.name}</td>
                                                <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                                                    <button onClick={() => removeHoliday(h.date)} style={{ padding: '4px 10px', background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>✕</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        {/* Quick-add common US holidays */}
                        <div style={{ marginTop: '20px', paddingTop: '15px', borderTop: '1px solid #eee' }}>
                            <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#666', marginBottom: '8px', textTransform: 'uppercase' }}>Quick Add 2026 US Holidays</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                {[
                                    { date: '2026-01-01', name: "New Year's Day" },
                                    { date: '2026-01-19', name: 'MLK Jr. Day' },
                                    { date: '2026-02-16', name: "Presidents' Day" },
                                    { date: '2026-04-03', name: 'Good Friday' },
                                    { date: '2026-05-25', name: 'Memorial Day' },
                                    { date: '2026-06-19', name: 'Juneteenth' },
                                    { date: '2026-07-03', name: 'Independence Day (Obs)' },
                                    { date: '2026-09-07', name: 'Labor Day' },
                                    { date: '2026-11-26', name: 'Thanksgiving' },
                                    { date: '2026-12-25', name: 'Christmas' },
                                ].map(h => {
                                    const exists = getHolidays().find(x => x.date === h.date);
                                    return (
                                        <button key={h.date} disabled={exists} onClick={() => { setNewHolidayDate(h.date); setNewHolidayName(h.name); }} style={{ padding: '4px 8px', fontSize: '11px', background: exists ? '#e9ecef' : '#f0f7ff', color: exists ? '#999' : '#007bff', border: '1px solid ' + (exists ? '#dee2e6' : '#b8daff'), borderRadius: '4px', cursor: exists ? 'default' : 'pointer' }}>{h.name}</button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'sql' && (
                <div style={{display:'grid', gridTemplateColumns:'1fr 3fr', gap:'20px'}}>
                    <div style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                        <h4>Quick Actions</h4>
                        <button onClick={() => runQuickSql('SELECT * FROM users ORDER BY created_at DESC LIMIT 10')} style={{ padding: '8px 16px', background: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', width:'100%', marginBottom:'10px' }}>Show Recent Users</button>
                        <button onClick={() => runQuickSql('SELECT * FROM stocks')} style={{ padding: '8px 16px', background: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', width:'100%', marginBottom:'10px' }}>Show All Stocks</button>
                        <button onClick={() => runQuickSql('SELECT * FROM holdings')} style={{ padding: '8px 16px', background: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', width:'100%', marginBottom:'10px' }}>Show All Holdings</button>
                    </div>
                    <div style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', height: '600px', display:'flex', flexDirection:'column' }}>
                        {sqlOutput ? (
                            <div style={{overflow:'auto', background:'#f8f9fa', padding:'10px', borderRadius:'4px', height:'100%'}}>
                                <div style={{marginBottom:'10px', display:'flex', justifyContent:'space-between'}}><strong>Result ({sqlOutput.rowCount || 0} rows)</strong><button onClick={() => setSqlOutput(null)} style={{fontSize:'12px', cursor:'pointer', border:'none', background:'none', color:'blue'}}>Clear</button></div>
                                <pre>{JSON.stringify(sqlOutput.rows, null, 2)}</pre>
                            </div>
                        ) : ( <iframe src="/sql_tool.html" style={{ width: '100%', height: '100%', border: 'none' }} title="SQL Tool"></iframe> )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default AdminDashboard;
