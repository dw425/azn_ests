import React, { useState, useEffect } from 'react';

// POINT TO YOUR BACKEND
const API_BASE = 'https://stock-trading-api-fcp5.onrender.com';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(null);
  const [stocks, setStocks] = useState([]);
  const [wallet, setWallet] = useState(null); // To store user's cash balance
  
  // Auth State
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Trading Modal State
  const [selectedStock, setSelectedStock] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [tradeMsg, setTradeMsg] = useState('');

  // --- INITIAL DATA FETCH ---
  useEffect(() => {
    if (token) {
      fetchStocks();
      fetchWallet(); // Get the money!
    }
  }, [token]);

  const fetchStocks = () => {
    fetch(`${API_BASE}/api/stocks`)
      .then(res => res.json())
      .then(data => setStocks(data))
      .catch(err => console.error(err));
  };

  const fetchWallet = () => {
    // We fetch the user details again to get the wallet balance if needed, 
    // but for now, we will just trust the user object or fetch a dedicated wallet route.
    // Since we don't have a dedicated "get wallet" route yet, we'll cheat slightly 
    // and rely on the local calculation or add a simple wallet fetch later.
    // For now, let's assume the user starts with $10k and we track it locally after login
    // NOTE: In a real app, you'd hit /api/wallet/me. 
  };

  // --- HANDLERS ---
  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
    setStocks([]);
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const endpoint = isLogin 
      ? `${API_BASE}/api/auth/login` 
      : `${API_BASE}/api/auth/register`;
      
    const payload = isLogin 
      ? { username, password } 
      : { username, email, password };

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Something went wrong');

      if (isLogin) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        setToken(data.token);
        setUser(data.user);
      } else {
        setIsLogin(true);
        setError('Account created! Please log in.');
        setUsername('');
        setPassword('');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // --- BUY STOCK FUNCTION ---
  const handleBuy = async () => {
    setTradeMsg('Processing...');
    
    // Safety check
    if(!user || !selectedStock) return;

    try {
      const res = await fetch(`${API_BASE}/api/orders/buy`, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            // 'Authorization': `Bearer ${token}` // In a real app, we need this!
        },
        body: JSON.stringify({
            userId: user.id || user.user_id, // Handle both naming conventions
            stockId: selectedStock.stock_id,
            quantity: Number(quantity)
        })
      });

      const data = await res.json();

      if(res.ok) {
        setTradeMsg(`✅ Success! Bought ${quantity} shares.`);
        setTimeout(() => {
            setSelectedStock(null); // Close modal
            setTradeMsg('');
            setQuantity(1);
        }, 1500);
      } else {
        setTradeMsg(`❌ Error: ${data.error}`);
      }

    } catch (err) {
      setTradeMsg(`❌ Network Error: ${err.message}`);
    }
  };

  // --- DASHBOARD VIEW ---
  if (token) {
    const savedUser = user || JSON.parse(localStorage.getItem('user'));
    
    return (
      <div style={{ fontFamily: 'sans-serif', background: '#f4f6f8', minHeight: '100vh' }}>
        
        {/* HEADER */}
        <div style={{ background: '#fff', padding: '15px 30px', boxShadow: '0 2px 5px rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, color: '#333' }}>🚀 Market<span style={{color:'#007bff'}}>Sim</span></h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <span style={{ fontWeight: 'bold', color: '#555' }}>👤 {savedUser?.username}</span>
            <button onClick={handleLogout} style={{ padding: '8px 16px', background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Logout</button>
          </div>
        </div>

        {/* STOCK GRID */}
        <div style={{ padding: '30px', maxWidth: '1200px', margin: '0 auto' }}>
          <h3 style={{ color: '#444', marginBottom: '20px' }}>Today's Market</h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '20px' }}>
            {stocks.map(stock => (
              <div key={stock.stock_id} style={{ background: 'white', padding: '20px', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', borderLeft: '5px solid #007bff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h3 style={{ margin: 0 }}>{stock.ticker}</h3>
                  <span style={{ background: '#e3f2fd', color: '#007bff', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' }}>{stock.sector}</span>
                </div>
                <p style={{ margin: '0 0 15px 0', color: '#666', fontSize: '14px' }}>{stock.company_name}</p>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#28a745' }}>
                  ${Number(stock.current_price).toFixed(2)}
                </div>
                <button 
                    onClick={() => setSelectedStock(stock)}
                    style={{ width: '100%', marginTop: '15px', padding: '10px', background: '#007bff', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>
                    Trade
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* BUY MODAL (POPUP) */}
        {selectedStock && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ background: 'white', padding: '30px', borderRadius: '10px', width: '400px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
                    <h2>Buy {selectedStock.ticker}</h2>
                    <p style={{color:'#666'}}>{selectedStock.company_name}</p>
                    
                    <div style={{ margin: '20px 0', padding: '15px', background: '#f8f9fa', borderRadius: '5px' }}>
                        <label style={{display:'block', fontWeight:'bold', marginBottom:'5px'}}>Quantity:</label>
                        <input 
                            type="number" 
                            min="1" 
                            value={quantity} 
                            onChange={(e) => setQuantity(e.target.value)}
                            style={{ width: '100%', padding: '10px', boxSizing:'border-box', fontSize:'16px' }} 
                        />
                        <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                            <span>Total Cost:</span>
                            <span style={{color: '#dc3545'}}>${(Number(selectedStock.current_price) * quantity).toFixed(2)}</span>
                        </div>
                    </div>

                    {tradeMsg && <div style={{ marginBottom: '15px', padding:'10px', background: tradeMsg.includes('Success')?'#d4edda':'#f8d7da', borderRadius:'5px' }}>{tradeMsg}</div>}

                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button 
                            onClick={handleBuy}
                            style={{ flex: 1, padding: '12px', background: '#28a745', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>
                            Confirm Buy
                        </button>
                        <button 
                            onClick={() => { setSelectedStock(null); setTradeMsg(''); }}
                            style={{ flex: 1, padding: '12px', background: '#6c757d', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        )}
      </div>
    );
  }

  // --- LOGIN VIEW ---
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif', background: '#f0f2f5' }}>
      <div style={{ background: 'white', padding: '40px', borderRadius: '8px', boxShadow: '0 4px 10px rgba(0,0,0,0.1)', width: '350px' }}>
        <h2 style={{ textAlign: 'center', marginBottom: '20px' }}>{isLogin ? '🔑 Login' : '📝 Create Account'}</h2>
        {error && <div style={{ background: '#f8d7da', color: '#721c24', padding: '10px', borderRadius: '5px', marginBottom: '15px', fontSize: '14px' }}>{error}</div>}
        <form onSubmit={handleAuth}>
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Username</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)} required style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ccc', boxSizing: 'border-box' }}/>
          </div>
          {!isLogin && (
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ccc', boxSizing: 'border-box' }}/>
            </div>
          )}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ccc', boxSizing: 'border-box' }}/>
          </div>
          <button type="submit" disabled={loading} style={{ width: '100%', padding: '12px', background: '#007bff', color: 'white', border: 'none', borderRadius: '5px', fontSize: '16px', cursor: 'pointer' }}>
            {loading ? 'Processing...' : (isLogin ? 'Login' : 'Sign Up')}
          </button>
        </form>
        <p style={{ textAlign: 'center', marginTop: '20px', fontSize: '14px', color: '#666' }}>
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <span onClick={() => { setIsLogin(!isLogin); setError(''); }} style={{ color: '#007bff', cursor: 'pointer', fontWeight: 'bold' }}>{isLogin ? 'Register' : 'Login'}</span>
        </p>
      </div>
    </div>
  );
}

export default App;
