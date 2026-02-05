import React, { useState, useEffect } from 'react';

const API_BASE = 'https://stock-trading-api-fcp5.onrender.com';

function AdminDashboard({ onBack, onLoginAs }) {
    // --- STATE MANAGEMENT ---
    const [activeTab, setActiveTab] = useState('stocks'); 
    const [users, setUsers] = useState([]);
    const [stocks, setStocks] = useState([]);
    const [settings, setSettings] = useState({ market_status: 'OPEN', simulated_date: new Date().toISOString() });
    
    // UI State
    const [msg, setMsg] = useState('');
    const [stockMsg, setStockMsg] = useState('');
    const [sqlOutput, setSqlOutput] = useState(null); 
    const [customDate, setCustomDate] = useState(''); // For Calendar Input

    // Forms
    const [newUser, setNewUser] = useState('');
    const [newPass, setNewPass] = useState('');
    const [newSymbol, setNewSymbol] = useState('');
    const [newName, setNewName] = useState('');
    const [newPrice, setNewPrice] = useState('');
    const [newVol, setNewVol] = useState('0.02');
    const [newSector, setNewSector] = useState('Tech');

    // --- INITIAL DATA LOAD ---
    useEffect(() => {
        fetchSettings(); // Always get system status
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
        } catch (err) { setMsg('❌ Error updating settings'); }
    };

    const handleDateChange = () => {
        if(customDate) {
            updateSettings({ simulated_date: new Date(customDate).toISOString() });
        }
    };

    const advanceTime = (hours) => {
        const currentDate = new Date(settings.simulated_date || Date.now());
        currentDate.setHours(currentDate.getHours() + hours);
        updateSettings({ simulated_date: currentDate.toISOString() });
    };

    // --- HISTORY GENERATOR ---
    const handleGenerateHistory = async () => {
        if(!window.confirm("WARNING: This will wipe all users and generate new history. Continue?")) return;
        setMsg('⏳ Generating History... Please wait...');
        try {
            const res = await fetch(`${API_BASE}/api/admin/generate-prices`, { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ year: 2026 }) 
            });
            const data = await res.json();
            if (res.ok) setMsg(`✅ Success: ${data.message}`); else setMsg(`❌ Error: ${data.error}`);
        } catch (err) { setMsg(`❌ Network Error: ${err.message}`); }
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
        try { const res = await fetch(`${API_BASE}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: newUser, password: newPass, email: `${newUser}@example.com` }) }); if (res.ok) { setMsg(`✅ User ${newUser} created!`); setNewUser(''); setNewPass(''); } else { setMsg(`❌ Error`); } } catch (err) { setMsg(`❌ Error: ${err.message}`); }
    };
    const handleCreateStock = async (e) => {
        e.preventDefault();
        try { const res = await fetch(`${API_BASE}/api/admin/stocks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: newSymbol, name: newName, base_price: parseFloat(newPrice), volatility: parseFloat(newVol), sector: newSector }) }); if (res.ok) { setStockMsg('✅ Added!'); setNewSymbol(''); fetchStocks(); } } catch (err) { }
    };
    const toggleAdmin = async (userId, currentStatus) => {
        try { await fetch(`${API_BASE}/api/auth/users/${userId}/role`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isAdmin: !currentStatus }) }); fetchUsers(); } catch (err) { }
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
                            <div style={{fontSize:'10px', color:'#666', textTransform:'uppercase'}}>Simulated Time</div>
                            <div style={{fontWeight:'bold', fontSize:'14px'}}>{new Date(settings.simulated_date || Date.now()).toLocaleString()}</div>
                        </div>
                    </div>
                </div>
                <div style={{display:'flex', gap:'10px', flexDirection:'column', alignItems:'flex-end'}}>
                    <button onClick={onBack} style={{ padding: '8px 16px', background: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>← Back to Dashboard</button>
                    <button onClick={handleGenerateHistory} style={{ padding: '8px 16px', background:'#6f42c1', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize:'13px', boxShadow:'0 2px 5px rgba(0,0,0,0.2)' }}>⚡ Generate History</button>
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
                            <button type="submit" style={{ padding: '10px 20px', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', width: '100%' }}>Add Stock</button>
                        </form>
                    </div>
                    <div style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                        <h3>Current Market ({stocks.length})</h3>
                        <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead><tr style={{ textAlign: 'left', background: '#f8f9fa' }}><th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Symbol</th><th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Price</th><th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Vol</th><th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Actions</th></tr></thead>
                                <tbody>
                                    {stocks.map(s => (
                                        <tr key={s.ticker} style={{ borderBottom: '1px solid #eee' }}>
                                            <td style={{ padding: '12px', color: '#333' }}><strong>{s.ticker}</strong><br/><span style={{fontSize:'12px', color:'#666'}}>{s.name}</span></td>
                                            <td style={{ padding: '12px', color: '#333' }}>${s.current_price}</td>
                                            <td style={{ padding: '12px', color: '#333' }}><input type="number" step="0.01" defaultValue={s.volatility} onBlur={(e) => handleUpdateStock(s.ticker, e.target.value, s.base_price, s.sector)} style={{width: '60px', padding: '5px', border:'1px solid #ddd', borderRadius:'4px'}} /></td>
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
                        <thead><tr style={{ background: '#f8f9fa', textAlign: 'left' }}><th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Username</th><th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Role</th><th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Action</th></tr></thead>
                        <tbody>
                            {users.map(u => (
                                <tr key={u.user_id} style={{ borderBottom: '1px solid #eee' }}>
                                    <td style={{ padding: '12px', color: '#333' }}>{u.username}</td>
                                    <td style={{ padding: '12px', color: '#333' }}><label style={{cursor:'pointer', display:'flex', alignItems:'center', gap:'5px'}}><input type="checkbox" checked={u.is_admin || false} onChange={() => toggleAdmin(u.user_id, u.is_admin)} /> {u.is_admin ? <span style={{color:'green', fontWeight:'bold'}}>Admin</span> : 'User'}</label></td>
                                    <td style={{ padding: '12px', color: '#333' }}><button onClick={() => onLoginAs(u)} style={{ padding: '5px 10px', background: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>Login As</button></td>
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
                        <div style={{ marginBottom: '15px' }}><label>Username</label><input style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }} value={newUser} onChange={e => setNewUser(e.target.value)} required /></div>
                        <div style={{ marginBottom: '15px' }}><label>Password</label><input style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }} value={newPass} onChange={e => setNewPass(e.target.value)} required /></div>
                        <button type="submit" style={{ padding: '10px 20px', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', width: '100%' }}>Create User</button>
                    </form>
                </div>
            )}

            {activeTab === 'settings' && (
                <div style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                    <h3>Time & Market Control</h3>
                    <div style={{display:'flex', gap:'20px', marginBottom:'30px'}}>
                        <button onClick={() => updateSettings({market_status: 'OPEN'})} style={{ padding: '20px', flex:1, border:'none', borderRadius:'8px', cursor:'pointer', fontWeight:'bold', fontSize:'18px', background: settings.market_status==='OPEN' ? '#28a745' : '#eee', color: settings.market_status==='OPEN'?'white':'#999'}}>Market OPEN</button>
                        <button onClick={() => updateSettings({market_status: 'CLOSED'})} style={{ padding: '20px', flex:1, border:'none', borderRadius:'8px', cursor:'pointer', fontWeight:'bold', fontSize:'18px', background: settings.market_status==='CLOSED' ? '#dc3545' : '#eee', color: settings.market_status==='CLOSED'?'white':'#999'}}>Market CLOSED</button>
                    </div>

                    <div style={{marginBottom: '30px'}}>
                        <h4>Time Machine (Quick Jump)</h4>
                        <div style={{display:'flex', gap:'10px'}}>
                            <button onClick={() => advanceTime(1)} style={{ padding: '8px 16px', background: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>+1 Hour</button>
                            <button onClick={() => advanceTime(24)} style={{ padding: '8px 16px', background: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>+1 Day</button>
                            <button onClick={() => advanceTime(168)} style={{ padding: '8px 16px', background: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>+1 Week</button>
                        </div>
                    </div>

                    <div>
                        <h4>Calendar Control (Specific Date)</h4>
                        <p style={{color:'#666', marginBottom:'10px'}}>Manually set the simulation date and time.</p>
                        <div style={{display:'flex', gap:'10px', alignItems:'center'}}>
                            <input type="datetime-local" value={customDate} onChange={(e) => setCustomDate(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }} />
                            <button onClick={handleDateChange} style={{ padding: '8px 16px', background: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', whiteSpace:'nowrap' }}>Update Time</button>
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
