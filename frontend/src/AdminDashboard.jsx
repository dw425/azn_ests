import React, { useState, useEffect } from 'react';

// POINT TO YOUR BACKEND
const API_BASE = 'https://stock-trading-api-fcp5.onrender.com';

function AdminDashboard({ onBack, onLoginAs }) {
    const [users, setUsers] = useState([]);
    const [activeTab, setActiveTab] = useState('users'); // 'users', 'create', 'sql'
    
    // Create User Form State
    const [newUser, setNewUser] = useState('');
    const [newPass, setNewPass] = useState('');
    const [msg, setMsg] = useState('');

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            const res = await fetch(`${API_BASE}/api/auth/users`);
            const data = await res.json();
            setUsers(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error(err);
        }
    };

    // --- NEW: Toggle Admin Status ---
    const toggleAdmin = async (userId, currentStatus) => {
        // 1. Optimistic UI Update (Change it on screen instantly)
        const newStatus = !currentStatus;
        setUsers(users.map(u => u.user_id === userId ? { ...u, is_admin: newStatus } : u));

        // 2. Send to Backend
        try {
            const token = localStorage.getItem('token'); // Need token for permission? (Ideally yes, but simplified for now)
            await fetch(`${API_BASE}/api/auth/users/${userId}/role`, {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ isAdmin: newStatus })
            });
        } catch (err) {
            console.error('Failed to update role', err);
            fetchUsers(); // Revert on error
        }
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
                setNewUser('');
                setNewPass('');
                fetchUsers(); // Refresh list
            } else {
                setMsg(`❌ Error: ${data.error}`);
            }
        } catch (err) {
            setMsg(`❌ Network Error: ${err.message}`);
        }
    };

    return (
        <div style={{ padding: '30px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'sans-serif' }}>
            
            {/* HEADER */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
                <h1 style={{ margin: 0, color: '#333' }}>🔒 Admin<span style={{color:'#d32f2f'}}>Panel</span></h1>
                <button onClick={onBack} style={btnSecondary}>← Back to Dashboard</button>
            </div>

            {/* TABS */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '1px solid #ddd', paddingBottom: '10px' }}>
                <button onClick={() => setActiveTab('users')} style={activeTab === 'users' ? tabActive : tabInactive}>👥 User Management</button>
                <button onClick={() => setActiveTab('create')} style={activeTab === 'create' ? tabActive : tabInactive}>➕ Create User</button>
                <button onClick={() => setActiveTab('sql')} style={activeTab === 'sql' ? tabActive : tabInactive}>🛠 SQL Tool</button>
            </div>

            {/* CONTENT: USERS TABLE */}
            {activeTab === 'users' && (
                <div style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                    <h3 style={{ marginTop: 0 }}>System Users ({users.length})</h3>
                    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '15px' }}>
                        <thead>
                            <tr style={{ background: '#f8f9fa', textAlign: 'left' }}>
                                <th style={thStyle}>ID</th>
                                <th style={thStyle}>Username</th>
                                <th style={thStyle}>Is Admin?</th> {/* New Column */}
                                <th style={thStyle}>Created Date</th>
                                <th style={thStyle}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map(u => (
                                <tr key={u.user_id} style={{ borderBottom: '1px solid #eee' }}>
                                    <td style={tdStyle}>{u.user_id}</td>
                                    <td style={{...tdStyle, fontWeight:'bold'}}>{u.username}</td>
                                    
                                    {/* CHECKBOX FOR ADMIN */}
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

            {/* CONTENT: CREATE USER */}
            {activeTab === 'create' && (
                <div style={{ background: 'white', padding: '30px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', maxWidth: '500px' }}>
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

            {/* CONTENT: SQL TOOL */}
            {activeTab === 'sql' && (
                <div style={{ height: '800px', background: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
                    {/* Points to the file you moved to public/ */}
                    <iframe src="/sql_tool.html" style={{ width: '100%', height: '100%', border: 'none' }} title="SQL Tool"></iframe>
                </div>
            )}
        </div>
    );
}

// Styles
const btnPrimary = { padding: '10px 20px', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' };
const btnSecondary = { padding: '8px 16px', background: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' };
const btnSmall = { padding: '5px 10px', background: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' };
const tabActive = { padding: '10px 20px', background: '#333', color: 'white', border: 'none', borderRadius: '4px 4px 0 0', cursor: 'pointer' };
const tabInactive = { padding: '10px 20px', background: 'none', color: '#666', border: 'none', cursor: 'pointer' };
const thStyle = { padding: '12px', borderBottom: '2px solid #ddd' };
const tdStyle = { padding: '12px', color: '#333' };
const inputStyle = { width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' };

export default AdminDashboard;
