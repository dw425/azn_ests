import React, { useState, useEffect, useRef } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import AdminDashboard from './AdminDashboard.jsx'; 

const API_BASE = 'https://stock-trading-api-fcp5.onrender.com';

// --- HELPER COMPONENTS (Defined inline to ensure no missing imports) ---

const MetricCard = ({ title, value, sub, color, highlight }) => (
    <div style={{ 
        background: 'white', 
        padding: '20px', 
        borderRadius: '8px', 
        boxShadow: highlight ? '0 4px 12px rgba(0,123,255,0.2)' : '0 1px 3px rgba(0,0,0,0.1)', 
        borderTop: highlight ? '4px solid #007bff' : 'none',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center'
    }}>
        <div style={{ fontSize: '12px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '5px' }}>
            {title}
        </div>
        <div style={{ fontSize: '24px', fontWeight: 'bold', color: color || '#333' }}>
            {value}
        </div>
        <div style={{ fontSize: '13px', color: '#666', marginTop: '2px' }}>
            {sub}
        </div>
    </div>
);

const ChangeIndicator = ({ val, isPercent }) => {
     if(!val || val === 0) return <span style={{color:'#999', fontSize:'12px'}}>-</span >;
     const color = val > 0 ? '#28a745' : '#dc3545';
     const arrow = val > 0 ? '▲' : '▼';
     return (
        <span style={{color, fontWeight:'bold', display: 'flex', alignItems: 'center', gap: '4px'}}>
            {arrow} {isPercent ? Number(val).toFixed(2) + '%' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val)}
        </span>
     );
};

function App() {
  // --- GLOBAL STATE ---
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(null);
  const [view, setView] = useState('dashboard'); // 'dashboard', 'history', 'admin'
  const [loading, setLoading] = useState(false); // For Auth actions
  const [dataLoading, setDataLoading] = useState(false); // For Dashboard data

  // --- DASHBOARD DATA STATE ---
  const [portfolio, setPortfolio] = useState({ cash: 0, stockValue: 0, totalValue: 0, dayChange: 0, dayChangePct: 0 }); 
  const [holdings, setHoldings] = useState([]);     
  const [market, setMarket] = useState([]);         
  const [chartData, setChartData] = useState([]);
  const [history, setHistory] = useState([]);
  const [marketStatus, setMarketStatus] = useState('OPEN'); // 'OPEN' or 'CLOSED'
  const [lastActivity, setLastActivity] = useState(null);
  const [marketCheck, setMarketCheck] = useState({ allowed: true, reason: '', status: 'OPEN' });

  // --- CHART CONTROLS ---
  const [chartRange, setChartRange] = useState('30D'); // '1D', '5D', '30D', '90D', '1Y'
  const [selectedStockIds, setSelectedStockIds] = useState([]); // empty = all holdings

  // --- PENDING QUEUE STATE ---
  const [pendingTx, setPendingTx] = useState([]); 

  // --- UI STATE ---
  const [sectorFilter, setSectorFilter] = useState('All');
  const [showHighValueWarning, setShowHighValueWarning] = useState(false);
  const [showWallet, setShowWallet] = useState(false);
  const [walletMode, setWalletMode] = useState('DEPOSIT'); // 'DEPOSIT' | 'WITHDRAW'
  const [walletHistory, setWalletHistory] = useState([]);
  
  // --- MODAL STATE ---
  const [selectedStock, setSelectedStock] = useState(null); 
  const [modalMode, setModalMode] = useState('BUY'); // 'BUY' or 'SELL'
  const [quantity, setQuantity] = useState(1);
  const [tradeMsg, setTradeMsg] = useState('');
  const [tradeError, setTradeError] = useState('');

  // --- FORM STATE ---
  const [walletAmount, setWalletAmount] = useState('');
  const [walletMsg, setWalletMsg] = useState('');
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regFullName, setRegFullName] = useState('');
  const [authError, setAuthError] = useState('');
  const [regSuccess, setRegSuccess] = useState('');

  // --- INITIALIZATION EFFECTS ---

  // 1. Check for local token on load
  useEffect(() => {
    if (token) {
      try {
        const savedUser = JSON.parse(localStorage.getItem('user'));
        if (savedUser) {
            setUser(savedUser);
            loadDashboard(savedUser.id || savedUser.user_id);
        } else {
            handleLogout(); 
        }
      } catch (e) { handleLogout(); }
    }
  }, [token]);

  // 2. Reload data when view changes
  useEffect(() => {
      if(token && user) {
          if(view === 'dashboard') loadDashboard(user.id || user.user_id);
          if(view === 'history') { loadHistory(user.id || user.user_id); loadWalletHistory(user.id || user.user_id); }
      }
  }, [view, token, user]);

  // 2b. AUTO-REFRESH: Poll every 10s for live price updates when market is open
  useEffect(() => {
      if (!token || !user || view !== 'dashboard') return;
      
      const refreshLiveData = async () => {
          const userId = user.id || user.user_id;
          try {
              const [portRes, holdRes, marketRes, checkRes] = await Promise.all([
                  fetch(`${API_BASE}/api/portfolio/summary/${userId}`),
                  fetch(`${API_BASE}/api/portfolio/holdings/${userId}`),
                  fetch(`${API_BASE}/api/stocks`),
                  fetch(`${API_BASE}/api/admin/market-check`)
              ]);
              const [portData, holdData, marketData, checkData] = await Promise.all([
                  portRes.json(), holdRes.json(), marketRes.json(), checkRes.json()
              ]);
              setPortfolio(portData);
              setHoldings(Array.isArray(holdData) ? holdData : []);
              setMarket(Array.isArray(marketData) ? marketData : []);
              setMarketCheck(checkData);
              if (checkData.status) setMarketStatus(checkData.status);
          } catch (err) { 
              console.error("Auto-refresh error:", err); 
          }
      };

      const interval = setInterval(refreshLiveData, 10000);
      return () => clearInterval(interval);
  }, [token, user, view]);

  // 3. PENDING QUEUE TIMER (The 60s Countdown)
  useEffect(() => {
      if (pendingTx.length === 0) return;

      const timer = setInterval(() => {
          setPendingTx(prev => prev.map(tx => {
              if (tx.timeLeft <= 1) {
                  // Time is up! Execution is handled by setTimeout, we just remove from UI
                  return null; 
              }
              return { ...tx, timeLeft: tx.timeLeft - 1 };
          }).filter(Boolean)); 
      }, 1000);

      return () => clearInterval(timer);
  }, [pendingTx]);

  // --- DATA LOADING FUNCTIONS ---

  const loadDashboard = async (userId) => {
    setDataLoading(true);
    try {
        const chartParams = new URLSearchParams({ range: chartRange });
        if (selectedStockIds.length > 0) chartParams.set('stocks', selectedStockIds.join(','));

        const [portRes, holdRes, chartRes, marketRes, settingsRes, activityRes, marketCheckRes] = await Promise.all([
            fetch(`${API_BASE}/api/portfolio/summary/${userId}`),
            fetch(`${API_BASE}/api/portfolio/holdings/${userId}`),
            fetch(`${API_BASE}/api/portfolio/chart/${userId}?${chartParams}`),
            fetch(`${API_BASE}/api/stocks`),
            fetch(`${API_BASE}/api/admin/settings`),
            fetch(`${API_BASE}/api/portfolio/last-activity/${userId}`),
            fetch(`${API_BASE}/api/admin/market-check`)
        ]);

        const portData = await portRes.json();
        const holdData = await holdRes.json();
        const chartData = await chartRes.json();
        const marketData = await marketRes.json();
        const settingsData = await settingsRes.json();
        const activityData = await activityRes.json();
        const marketCheckData = await marketCheckRes.json();

        if (!portData.error) setPortfolio(portData);
        setHoldings(Array.isArray(holdData) ? holdData : []);
        setChartData(Array.isArray(chartData) ? chartData : []);
        setMarket(Array.isArray(marketData) ? marketData : []);
        
        // Update Market Status Indicator
        if (settingsData && settingsData.market_status) {
            setMarketStatus(settingsData.market_status);
        }

        // Update Last Activity
        if (activityData) setLastActivity(activityData);

        // Update Market Check
        if (marketCheckData) {
            setMarketCheck(marketCheckData);
            setMarketStatus(marketCheckData.status || 'OPEN');
        }

    } catch (err) { console.error("Dashboard Load Error:", err); } 
    finally { setDataLoading(false); }
  };

  const loadHistory = async (userId) => {
      setDataLoading(true);
      try {
          const res = await fetch(`${API_BASE}/api/orders/history/${userId}`);
          const data = await res.json();
          setHistory(Array.isArray(data) ? data : []);
      } catch (err) { console.error("History Load Error:", err); } 
      finally { setDataLoading(false); }
  };

  const loadWalletHistory = async (userId) => {
      try {
          const res = await fetch(`${API_BASE}/api/wallet/history/${userId}`);
          const data = await res.json();
          setWalletHistory(Array.isArray(data) ? data : []);
      } catch (err) { console.error("Wallet History Load Error:", err); }
  };

  // Reload ONLY the chart (called when range or stock filter changes)
  const loadChart = async (userId, range, stockIds) => {
      try {
          const params = new URLSearchParams({ range });
          if (stockIds && stockIds.length > 0) params.set('stocks', stockIds.join(','));
          const res = await fetch(`${API_BASE}/api/portfolio/chart/${userId}?${params}`);
          const data = await res.json();
          setChartData(Array.isArray(data) ? data : []);
      } catch (err) { console.error("Chart Load Error:", err); }
  };

  // Re-fetch chart when range or stock filter changes
  useEffect(() => {
      if (token && user && view === 'dashboard') {
          loadChart(user.id || user.user_id, chartRange, selectedStockIds);
      }
  }, [chartRange, selectedStockIds]);

  // --- AUTHENTICATION HANDLERS ---

  const handleAuth = async (type, e) => {
    e.preventDefault();
    setLoading(true); 
    setAuthError(''); 
    setRegSuccess('');
    
    const endpoint = type === 'LOGIN' ? `${API_BASE}/api/auth/login` : `${API_BASE}/api/auth/register`;
    const payload = type === 'LOGIN' 
        ? { username: loginUsername, password: loginPassword } 
        : { username: regUsername, email: regEmail, password: regPassword, full_name: regFullName };

    try {
      const res = await fetch(endpoint, { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify(payload) 
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error);

      if (type === 'LOGIN') {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        setToken(data.token); 
        setUser(data.user); 
        setView('dashboard'); 
        loadDashboard(data.user.id);
      } else {
        setRegSuccess('✅ Account created! Please log in.');
        setRegUsername(''); setRegEmail(''); setRegPassword('');
      }
    } catch (err) { setAuthError(err.message); } 
    finally { setLoading(false); }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
    setView('dashboard');
  };

  // --- TRADING LOGIC (QUEUE SYSTEM) ---

  // 1. Initiate Check (High Value Warning)
  const initiateTradeCheck = () => {
      const tradeValue = selectedStock.current_price * quantity;
      
      // High Value Warning Logic
      if (tradeValue >= 10000 && !showHighValueWarning) {
          setShowHighValueWarning(true); 
          return;
      }
      
      queueTrade(); // Proceed if low value or warning confirmed
  };

  // 2. Add to Queue
  const queueTrade = () => {
      setShowHighValueWarning(false);
      
      const txDetails = {
          id: Date.now() + Math.random(),
          userId: user.id || user.user_id,
          stock: selectedStock,
          quantity: Number(quantity),
          mode: modalMode,
          price: selectedStock.current_price,
          total: selectedStock.current_price * quantity,
          timeLeft: 60 // 60 Seconds strict
      };

      // Set the "Time Bomb" execution
      const timeoutId = setTimeout(() => {
          executeTrade(txDetails);
      }, 60000); 

      // Update State
      setPendingTx(prev => [...prev, { ...txDetails, timeoutId }]);

      // Reset Modal UI
      setSelectedStock(null);
      setQuantity(1);
      setTradeMsg('');
  };

  // 3. Execute Trade (Server Call)
  const executeTrade = async (tx) => {
    try {
      const endpoint = tx.mode === 'BUY' ? '/api/orders/buy' : '/api/orders/sell';
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            userId: tx.userId,
            stockId: tx.stock.stock_id,
            quantity: tx.quantity
        })
      });
      
      const data = await res.json();
      
      if(res.ok) {
          // Success — refresh UI
          await new Promise(r => setTimeout(r, 500));
          if(view === 'dashboard') loadDashboard(tx.userId);
          if(view === 'history') loadHistory(tx.userId);
          setTradeError('');
      } else {
          // Server returned an error — SHOW IT
          const errMsg = `❌ ${tx.mode} ${tx.stock.ticker} FAILED: ${data.error || 'Unknown error'} (Status: ${res.status})`;
          console.error(errMsg);
          setTradeError(errMsg);
          // Auto-clear after 15 seconds
          setTimeout(() => setTradeError(''), 15000);
      }
    } catch (err) { 
        const errMsg = `❌ Network Error on ${tx.mode}: ${err.message}`;
        console.error(errMsg);
        setTradeError(errMsg);
        setTimeout(() => setTradeError(''), 15000);
    }
  };

  // 4. Cancel Trade
  const cancelPendingTrade = (txId) => {
      const tx = pendingTx.find(t => t.id === txId);
      if (tx) {
          clearTimeout(tx.timeoutId); // Stop the server call
          setPendingTx(prev => prev.filter(t => t.id !== txId)); // Remove from UI
      }
  };

  // --- WALLET LOGIC ---

  const handleWalletTransaction = async () => {
      const amt = Number(walletAmount);
      if (!amt || amt <= 0) { setWalletMsg('❌ Enter a valid amount.'); return; }
      
      setWalletMsg('Processing...');
      try {
          const sendAmount = walletMode === 'WITHDRAW' ? -amt : amt;
          const res = await fetch(`${API_BASE}/api/wallet/add`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: user.id || user.user_id, amount: sendAmount })
          });
          const data = await res.json();
          if (res.ok) {
              setWalletMsg(`✅ ${data.message}`);
              setTimeout(() => { 
                  setShowWallet(false); 
                  setWalletMsg(''); 
                  setWalletAmount(''); 
                  setWalletMode('DEPOSIT');
                  loadDashboard(user.id || user.user_id); 
              }, 1500);
          } else { setWalletMsg(`❌ ${data.error}`); }
      } catch (err) { setWalletMsg(`❌ Error: ${err.message}`); }
  };

  // --- UTILS ---
  const openBuyModal = (stock) => { setSelectedStock(stock); setModalMode('BUY'); setQuantity(1); setTradeMsg(''); setShowHighValueWarning(false); };
  const openSellModal = (stock) => { setSelectedStock(stock); setModalMode('SELL'); setQuantity(1); setTradeMsg(''); setShowHighValueWarning(false); };
  
  const setMaxSell = () => { 
      const owned = holdings.find(h => h.stock_id === selectedStock?.stock_id); 
      if(owned) setQuantity(Number(owned.quantity)); 
  };
  
  const formatMoney = (num) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num || 0);
  const formatDate = (dateStr) => { if(!dateStr) return '-'; return new Date(dateStr).toLocaleString(); }
  
  const filteredMarket = market.filter(s => sectorFilter === 'All' || s.sector === sectorFilter);

  // --- CHART STOCK FILTER HELPERS ---
  const toggleStockFilter = (stockId) => {
      setSelectedStockIds(prev => {
          if (prev.length === 0) {
              // Currently "all" — switch to all EXCEPT this one
              const allIds = holdings.map(h => h.stock_id);
              return allIds.filter(id => id !== stockId);
          }
          if (prev.includes(stockId)) {
              const next = prev.filter(id => id !== stockId);
              // If removing would leave empty, that means show all
              return next;
          }
          return [...prev, stockId];
      });
  };

  const isStockSelected = (stockId) => {
      if (selectedStockIds.length === 0) return true; // empty = all selected
      return selectedStockIds.includes(stockId);
  };

  const toggleAllStocks = () => {
      if (selectedStockIds.length === 0) {
          // All are selected, deselect all
          setSelectedStockIds([-1]); // dummy to mean "none"
      } else {
          // Some or none selected, select all
          setSelectedStockIds([]);
      }
  };

  const allStocksSelected = selectedStockIds.length === 0;

  // --- RENDER: ADMIN VIEW ---
  if (token && view === 'admin') {
      return (
        <AdminDashboard 
            onBack={() => setView('dashboard')} 
            onLoginAs={(u)=>{ 
                setUser(u); 
                setView('dashboard'); 
                loadDashboard(u.user_id); 
            }} 
        />
      );
  }

  // --- RENDER: LOGIN VIEW ---
  if (!token) {
    return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e9ecef', fontFamily: 'sans-serif' }}>
            <div style={{ display: 'flex', width: '900px', height: '600px', background: 'white', borderRadius: '20px', boxShadow: '0 20px 50px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
                {/* REGISTER SIDE */}
                <div style={{ flex: 1, background: '#2c3e50', padding: '50px', display: 'flex', flexDirection: 'column', justifyContent: 'center', color: 'white', position: 'relative' }}>
                    <div style={{ position: 'absolute', top: '30px', left: '30px', fontFamily: 'Georgia, serif', fontSize: '24px', fontWeight: 'bold' }}>
                        <span style={{ color: '#e74c3c' }}>C</span><span style={{ color: '#3498db' }}>D</span><span style={{ color: '#2ecc71' }}>M</span>
                    </div>
                    <h2 style={{ fontSize: '28px', marginBottom: '10px' }}>Create Profile</h2>
                    <p style={{ color: '#bdc3c7', marginBottom: '30px', lineHeight: '1.5' }}>Join the simulation. Build your portfolio.</p>
                    <form onSubmit={(e) => handleAuth('REGISTER', e)}>
                        <input style={{ width: '100%', padding: '12px', marginBottom: '15px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', color: 'white', boxSizing: 'border-box' }} type="text" placeholder="Full Name" value={regFullName} onChange={e=>setRegFullName(e.target.value)} />
                        <input style={{ width: '100%', padding: '12px', marginBottom: '15px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', color: 'white', boxSizing: 'border-box' }} type="text" placeholder="Username" value={regUsername} onChange={e=>setRegUsername(e.target.value)} />
                        <input style={{ width: '100%', padding: '12px', marginBottom: '15px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', color: 'white', boxSizing: 'border-box' }} type="email" placeholder="Email" value={regEmail} onChange={e=>setRegEmail(e.target.value)} />
                        <input style={{ width: '100%', padding: '12px', marginBottom: '15px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', color: 'white', boxSizing: 'border-box' }} type="password" placeholder="Password" value={regPassword} onChange={e=>setRegPassword(e.target.value)} />
                        <button type="submit" style={{ width: '100%', padding: '12px', background: '#e74c3c', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', marginTop: '10px' }} disabled={loading}>{loading ? 'Creating...' : 'Sign Up'}</button>
                    </form>
                    {authError && <div style={{ marginTop: '15px', color: '#e74c3c', fontSize: '13px' }}>{authError}</div>}
                    {regSuccess && <div style={{ marginTop: '15px', color: '#2ecc71', fontSize: '13px', fontWeight: 'bold' }}>{regSuccess}</div>}
                </div>
                {/* LOGIN SIDE */}
                <div style={{ flex: 1, padding: '50px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                    <h2 style={{ color: '#2c3e50', marginBottom: '30px', fontSize: '24px' }}>Welcome Back</h2>
                    <form onSubmit={(e) => handleAuth('LOGIN', e)} style={{ width: '100%' }}>
                        <div style={{ marginBottom: '15px' }}>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#7f8c8d', marginBottom: '5px', textTransform: 'uppercase' }}>Username</label>
                            <input style={{ width: '100%', padding: '12px', background: '#f8f9fa', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box', fontSize: '14px' }} type="text" value={loginUsername} onChange={e=>setLoginUsername(e.target.value)} />
                        </div>
                        <div style={{ marginBottom: '25px' }}>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#7f8c8d', marginBottom: '5px', textTransform: 'uppercase' }}>Password</label>
                            <input style={{ width: '100%', padding: '12px', background: '#f8f9fa', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box', fontSize: '14px' }} type="password" value={loginPassword} onChange={e=>setLoginPassword(e.target.value)} />
                        </div>
                        <button type="submit" style={{ width: '100%', padding: '12px', background: '#2c3e50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 5px 15px rgba(44, 62, 80, 0.3)' }} disabled={loading}>{loading ? 'Logging in...' : 'Log In'}</button>
                    </form>
                </div>
            </div>
        </div>
    );
  }

  // --- RENDER: DASHBOARD VIEW ---
  const isAdmin = user?.is_admin;
  const tradeValue = selectedStock ? selectedStock.current_price * quantity : 0;
  
  let canTrade = true;
  let errorReason = "";
  const ownedStock = holdings.find(h => h.stock_id === selectedStock?.stock_id);
  const ownedQty = ownedStock ? Number(ownedStock.quantity) : 0;

  // Market closed check
  if (!marketCheck.allowed) { canTrade = false; errorReason = marketCheck.reason; }
  else if (modalMode === 'BUY') { if (tradeValue > portfolio.cash) { canTrade = false; errorReason = `Insufficient Cash`; } }
  else { if (quantity > ownedQty) { canTrade = false; errorReason = `Insufficient Shares`; } }

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', background: '#f4f6f9', minHeight: '100vh', paddingBottom: '50px' }}>
      
      {/* HEADER BAR */}
      <div style={{ background: '#fff', padding: '15px 40px', borderBottom: '1px solid #e1e4e8', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            {/* LOGO */}
            <div style={{ fontFamily: 'Georgia, serif', fontSize: '32px', fontWeight: '900', letterSpacing: '1px' }}>
                <span style={{ color: '#d32f2f' }}>C</span><span style={{ color: '#1565c0' }}>D</span><span style={{ color: '#2e7d32' }}>M</span>
            </div>
            {/* TITLE */}
            <div style={{ display:'flex', flexDirection:'column', justifyContent:'center' }}>
                <span style={{ fontSize: '20px', fontWeight: '800', color: '#2c3e50', lineHeight:'1' }}>ProTrader</span>
                <span style={{ fontSize: '11px', fontWeight: '400', color: '#95a5a6', textTransform:'uppercase', letterSpacing:'2px' }}>Dashboard</span>
            </div>
            {/* MARKET STATUS INDICATOR */}
            <div style={{ 
                marginLeft: '20px', 
                padding: '5px 12px', 
                background: marketStatus === 'OPEN' ? '#e8f5e9' : '#ffebee', 
                border: `1px solid ${marketStatus === 'OPEN' ? '#2e7d32' : '#c62828'}`, 
                borderRadius: '20px', 
                fontSize: '12px', 
                fontWeight: 'bold', 
                color: marketStatus === 'OPEN' ? '#2e7d32' : '#c62828', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '6px',
                cursor: 'default',
                title: marketCheck.reason
            }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: marketStatus === 'OPEN' ? '#2e7d32' : '#c62828' }}></div>
                MARKET {marketStatus}
                {marketCheck.forced && <span style={{ fontSize: '10px', opacity: 0.7 }}>(forced)</span>}
            </div>
        </div>

        {/* NAVIGATION */}
        <div style={{display:'flex', gap:'20px'}}>
            <div onClick={() => setView('dashboard')} style={{cursor:'pointer', padding:'10px', borderBottom: view === 'dashboard' ? '3px solid #007bff' : 'none', fontWeight: view === 'dashboard' ? 'bold' : 'normal', color: view === 'dashboard' ? '#007bff' : '#666'}}>Dashboard</div>
            <div onClick={() => setView('history')} style={{cursor:'pointer', padding:'10px', borderBottom: view === 'history' ? '3px solid #007bff' : 'none', fontWeight: view === 'history' ? 'bold' : 'normal', color: view === 'history' ? '#007bff' : '#666'}}>History</div>
        </div>

        {/* USER CONTROLS */}
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
            <button onClick={() => setShowWallet(true)} style={{ padding: '8px 16px', fontSize: '13px', background: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>💰 Wallet</button>
            {isAdmin && (<button onClick={() => setView('admin')} style={{ padding: '8px 16px', fontSize: '13px', background: '#343a40', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>🔒 Admin</button>)}
            <span style={{ fontSize: '14px', fontWeight: '600', color: '#555' }}>{user?.username}</span>
            <button onClick={handleLogout} style={{ padding: '6px 12px', fontSize: '13px', background: 'none', border: '1px solid #d1d5da', borderRadius: '4px', cursor: 'pointer', color:'#666' }}>Logout</button>
        </div>
      </div>

      {dataLoading && <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>Loading data...</div>}

      <div style={{ maxWidth: '1400px', margin: '30px auto', padding: '0 20px' }}>
        
        {view === 'dashboard' ? (
            <>
              {/* TRADE ERROR BANNER */}
              {tradeError && (
                  <div style={{ padding: '15px 20px', background: '#f8d7da', border: '1px solid #f5c6cb', color: '#721c24', borderRadius: '8px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: '500', fontSize: '14px' }}>
                      <span>{tradeError}</span>
                      <button onClick={() => setTradeError('')} style={{ background: 'none', border: 'none', color: '#721c24', fontSize: '18px', cursor: 'pointer' }}>✕</button>
                  </div>
              )}

              {/* 1. METRICS ROW */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '30px' }}>
                  <MetricCard title="Cash Available" value={formatMoney(portfolio.cash)} sub="Buying Power" />
                  <MetricCard title="Stock Holdings" value={formatMoney(portfolio.stockValue)} sub={`${holdings.length} Position${holdings.length !== 1 ? 's' : ''}`} color="#007bff" />
                  <MetricCard title="Net Account Value" value={formatMoney(portfolio.totalValue)} sub="Cash + Holdings" highlight />
                  <div style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                      <div style={{ fontSize: '12px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Day's Change</div>
                      <div style={{ fontSize: '24px', fontWeight: 'bold', marginTop: '5px' }}><ChangeIndicator val={portfolio.dayChange} /></div>
                      <div style={{ fontSize: '13px', marginTop: '2px' }}><ChangeIndicator val={portfolio.dayChangePct} isPercent /></div>
                  </div>
                  {/* Last Transaction Card */}
                  <div style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: '4px solid #6c757d' }}>
                      <div style={{ fontSize: '12px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '5px' }}>Last Activity</div>
                      {lastActivity ? (
                          <>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                  <span style={{ 
                                      padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold',
                                      background: lastActivity.action_type === 'BUY' ? '#d4edda' : lastActivity.action_type === 'SELL' ? '#f8d7da' : lastActivity.action_type === 'DEPOSIT' ? '#d4edda' : '#fff3cd',
                                      color: lastActivity.action_type === 'BUY' ? '#155724' : lastActivity.action_type === 'SELL' ? '#721c24' : lastActivity.action_type === 'DEPOSIT' ? '#155724' : '#856404'
                                  }}>
                                      {lastActivity.action_type}
                                  </span>
                                  {lastActivity.category === 'TRADE' && <span style={{ fontWeight: 'bold', color: '#007bff', fontSize: '14px' }}>{lastActivity.label}</span>}
                              </div>
                              <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#333' }}>{formatMoney(lastActivity.amount)}</div>
                              <div style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>{formatDate(lastActivity.created_at)}</div>
                          </>
                      ) : (
                          <div style={{ fontSize: '14px', color: '#999', marginTop: '5px' }}>No activity yet</div>
                      )}
                  </div>
              </div>

              {/* 2. CHART SECTION */}
              <div style={{ background: 'white', padding: '25px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '30px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                      <h3 style={{ margin: 0, fontSize: '18px', color: '#333' }}>
                          Portfolio Performance
                          <span style={{ fontSize: '13px', color: '#999', fontWeight: 'normal', marginLeft: '8px' }}>
                              {chartRange === '1D' ? '(Today)' : chartRange === '5D' ? '(5 Day)' : chartRange === '30D' ? '(30 Day)' : chartRange === '90D' ? '(90 Day)' : '(1 Year)'}
                          </span>
                      </h3>
                      <div style={{ display: 'flex', gap: '4px', background: '#f0f2f5', borderRadius: '6px', padding: '3px' }}>
                          {['1D', '5D', '30D', '90D', '1Y'].map(range => (
                              <button 
                                  key={range} 
                                  onClick={() => setChartRange(range)}
                                  style={{ 
                                      padding: '6px 14px', border: 'none', borderRadius: '4px', cursor: 'pointer',
                                      fontSize: '12px', fontWeight: '600', transition: 'all 0.15s',
                                      background: chartRange === range ? '#007bff' : 'transparent',
                                      color: chartRange === range ? 'white' : '#666'
                                  }}
                              >
                                  {range}
                              </button>
                          ))}
                      </div>
                  </div>
                  <div style={{ height: '300px', width: '100%' }}>
                      <ResponsiveContainer>
                          <AreaChart data={chartData}>
                              <defs><linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#007bff" stopOpacity={0.1}/><stop offset="95%" stopColor="#007bff" stopOpacity={0}/></linearGradient></defs>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                              <XAxis 
                                  dataKey="date" 
                                  tick={{ fontSize: 11, fill: '#999' }} 
                                  tickLine={false} 
                                  interval="preserveStartEnd"
                                  tickFormatter={(val) => {
                                      if (!val || val === 'Now') return val;
                                      const d = new Date(val);
                                      if (isNaN(d)) return val;
                                      if (chartRange === '1D') return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                                      return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
                                  }}
                              />
                              <YAxis domain={['auto', 'auto']} tickFormatter={(val) => `$${(val/1000).toFixed(1)}k`} stroke="#999" fontSize={12} />
                              <Tooltip 
                                  formatter={(val) => formatMoney(val)} 
                                  labelFormatter={(label) => {
                                      if (!label || label === 'Now') return label;
                                      const d = new Date(label);
                                      if (isNaN(d)) return label;
                                      if (chartRange === '1D') return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                                      return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
                                  }}
                              />
                              <Area type="monotone" dataKey="value" stroke="#007bff" strokeWidth={2} fillOpacity={1} fill="url(#colorVal)" />
                          </AreaChart>
                      </ResponsiveContainer>
                  </div>
              </div>

              {/* 3. HOLDINGS TABLE */}
              <div style={{ background: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden', marginBottom:'30px' }}>
                  <div style={{ padding: '15px 25px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h3 style={{ margin: 0 }}>My Positions</h3>
                      <span style={{ fontSize: '12px', color: '#999' }}>☑ Check stocks to filter chart</span>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                      <thead style={{ background: '#f8f9fa', borderBottom: '2px solid #e1e4e8' }}>
                          <tr>
                            <th style={{ textAlign: 'center', padding: '12px 10px', color: '#444', fontWeight: '600', fontSize: '13px', width: '40px' }}>
                                <input 
                                    type="checkbox" 
                                    checked={allStocksSelected} 
                                    onChange={toggleAllStocks} 
                                    style={{ cursor: 'pointer', width: '15px', height: '15px' }} 
                                    title="Select All / None"
                                />
                            </th>
                            <th style={{ textAlign: 'left', padding: '12px 15px', color: '#444', fontWeight: '600', fontSize: '13px' }}>Symbol</th>
                            <th style={{ textAlign: 'left', padding: '12px 15px', color: '#444', fontWeight: '600', fontSize: '13px' }}>Last Price</th>
                            <th style={{ textAlign: 'left', padding: '12px 15px', color: '#444', fontWeight: '600', fontSize: '13px' }}>Day Change</th>
                            <th style={{ textAlign: 'left', padding: '12px 15px', color: '#444', fontWeight: '600', fontSize: '13px' }}>Total Gain/Loss</th>
                            <th style={{ textAlign: 'left', padding: '12px 15px', color: '#444', fontWeight: '600', fontSize: '13px' }}>Value</th>
                            <th style={{ textAlign: 'left', padding: '12px 15px', color: '#444', fontWeight: '600', fontSize: '13px' }}>Qty</th>
                            <th style={{ textAlign: 'left', padding: '12px 15px', color: '#444', fontWeight: '600', fontSize: '13px' }}>Action</th>
                          </tr>
                      </thead>
                      <tbody>
                          {holdings.length === 0 ? (<tr><td colSpan="8" style={{ padding: '30px', textAlign: 'center', color: '#999' }}>No positions held.</td></tr>) : (holdings.map(stock => (
                              <tr key={stock.stock_id} style={{ borderBottom: '1px solid #eee', opacity: isStockSelected(stock.stock_id) ? 1 : 0.5 }}>
                                  <td style={{ textAlign: 'center', padding: '12px 10px' }}>
                                      <input 
                                          type="checkbox" 
                                          checked={isStockSelected(stock.stock_id)} 
                                          onChange={() => toggleStockFilter(stock.stock_id)} 
                                          style={{ cursor: 'pointer', width: '15px', height: '15px' }} 
                                      />
                                  </td>
                                  <td style={{ padding: '12px 15px', fontWeight: 'bold', color: '#007bff' }}>{stock.ticker}</td>
                                  <td style={{ padding: '12px 15px' }}>{formatMoney(stock.current_price)}</td>
                                  <td style={{ padding: '12px 15px' }}><ChangeIndicator val={stock.day_change} isPercent /></td>
                                  <td style={{ padding: '12px 15px' }}><ChangeIndicator val={stock.total_gain} /></td>
                                  <td style={{ padding: '12px 15px', fontWeight:'bold' }}>{formatMoney(stock.market_value)}</td>
                                  <td style={{ padding: '12px 15px' }}>{stock.quantity}</td>
                                  <td style={{ padding: '12px 15px' }}><div style={{display:'flex', gap:'5px'}}><button onClick={() => openBuyModal(stock)} style={{ padding: '6px 12px', background: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>Buy</button><button onClick={() => openSellModal(stock)} style={{ padding: '6px 12px', background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>Sell</button></div></td>
                              </tr>
                          )))}
                      </tbody>
                  </table>
              </div>

              {/* 4. PENDING QUEUE (60 SECONDS) */}
              {pendingTx.length > 0 && (
                  <div style={{ background: '#fff', borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)', overflow: 'hidden', marginBottom:'30px', borderTop:'4px solid #ffc107' }}>
                      <div style={{ padding: '15px 25px', borderBottom: '1px solid #eee', background:'#fffbf2', display:'flex', alignItems:'center', gap:'10px' }}>
                          <h3 style={{ margin: 0, color:'#d39e00' }}>⏳ Pending Transactions</h3>
                          <span style={{fontSize:'12px', color:'#666'}}>(Processing in {pendingTx[0].timeLeft}s...)</span>
                      </div>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                          <thead style={{ background: '#f8f9fa', borderBottom: '2px solid #e1e4e8' }}>
                              <tr>
                                  <th style={{ textAlign: 'left', padding: '12px 15px', color: '#444' }}>Symbol</th>
                                  <th style={{ textAlign: 'left', padding: '12px 15px', color: '#444' }}>Action</th>
                                  <th style={{ textAlign: 'left', padding: '12px 15px', color: '#444' }}>Quantity</th>
                                  <th style={{ textAlign: 'left', padding: '12px 15px', color: '#444' }}>Price/Share</th>
                                  <th style={{ textAlign: 'left', padding: '12px 15px', color: '#444' }}>Total Price</th>
                                  <th style={{ textAlign: 'left', padding: '12px 15px', color: '#444' }}>Auto-Execute In</th>
                                  <th style={{ textAlign: 'left', padding: '12px 15px', color: '#444' }}>Cancel</th>
                              </tr>
                          </thead>
                          <tbody>
                              {pendingTx.map(tx => (
                                  <tr key={tx.id} style={{ borderBottom: '1px solid #eee', background:'#fff' }}>
                                      <td style={{ padding: '12px 15px', fontWeight: 'bold' }}>{tx.stock.ticker}</td>
                                      <td style={{ padding: '12px 15px' }}><span style={{ fontWeight:'bold', color: tx.mode === 'BUY' ? '#28a745' : '#dc3545' }}>{tx.mode}</span></td>
                                      <td style={{ padding: '12px 15px' }}>{tx.quantity}</td>
                                      <td style={{ padding: '12px 15px' }}>{formatMoney(tx.price)}</td>
                                      <td style={{ padding: '12px 15px', fontWeight:'bold' }}>{formatMoney(tx.total)}</td>
                                      <td style={{ padding: '12px 15px', color: tx.timeLeft < 10 ? '#d32f2f' : '#666', fontWeight:'bold' }}>{tx.timeLeft}s</td>
                                      <td style={{ padding: '12px 15px' }}>
                                          <button onClick={() => cancelPendingTrade(tx.id)} 
                                              style={{
                                                  padding: '8px 16px', 
                                                  background: '#ffc107', 
                                                  color: '#212529', 
                                                  border: '1px solid #e0a800', 
                                                  borderRadius: '4px', 
                                                  cursor: 'pointer', 
                                                  fontWeight: 'bold', 
                                                  fontSize: '13px',
                                                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                                              }}>
                                              ✖ CANCEL
                                          </button>
                                      </td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
              )}

              {/* 5. MARKET DATA */}
              <div style={{ background: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
                  <div style={{ padding: '15px 25px', borderBottom: '1px solid #eee', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <h3 style={{ margin: 0 }}>Market Data</h3>
                      <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                          <span style={{fontSize:'13px', fontWeight:'bold', color:'#666'}}>Filter Sector:</span>
                          <select value={sectorFilter} onChange={(e) => setSectorFilter(e.target.value)} style={{padding:'5px', borderRadius:'4px', border:'1px solid #ccc'}}>
                              <option value="All">All Sectors</option>
                              <option value="Tech">Tech</option>
                              <option value="Finance">Finance</option>
                              <option value="Auto">Auto</option>
                              <option value="Energy">Energy</option>
                              <option value="Health">Health</option>
                              <option value="Crypto">Crypto</option>
                          </select>
                      </div>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                      <thead style={{ background: '#f8f9fa', borderBottom: '2px solid #e1e4e8' }}>
                          <tr>
                            <th style={{ textAlign: 'left', padding: '12px 15px', color: '#444' }}>Symbol</th>
                            <th style={{ textAlign: 'left', padding: '12px 15px', color: '#444' }}>Company</th>
                            <th style={{ textAlign: 'right', padding: '12px 15px', color: '#444' }}>Price</th>
                            <th style={{ textAlign: 'right', padding: '12px 15px', color: '#444' }}>Open</th>
                            <th style={{ textAlign: 'right', padding: '12px 15px', color: '#444' }}>High</th>
                            <th style={{ textAlign: 'right', padding: '12px 15px', color: '#444' }}>Low</th>
                            <th style={{ textAlign: 'right', padding: '12px 15px', color: '#444' }}>Volume</th>
                            <th style={{ textAlign: 'right', padding: '12px 15px', color: '#444' }}>Market Cap</th>
                            <th style={{ textAlign: 'right', padding: '12px 15px', color: '#444' }}>Today %</th>
                            <th style={{ textAlign: 'center', padding: '12px 15px', color: '#444' }}>Action</th>
                          </tr>
                      </thead>
                      <tbody>
                          {filteredMarket.length === 0 ? (<tr><td colSpan="10" style={{ padding: '20px', textAlign: 'center' }}>Loading or No Stocks in this Sector...</td></tr>) : (filteredMarket.map(stock => (
                              <tr key={stock.stock_id} style={{ borderBottom: '1px solid #eee' }}>
                                  <td style={{ padding: '12px 15px', fontWeight: 'bold', color: '#007bff' }}>{stock.ticker}</td>
                                  <td style={{ padding: '12px 15px', maxWidth: '150px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{stock.company_name}</td>
                                  <td style={{ padding: '12px 15px', fontWeight:'bold', textAlign: 'right' }}>{formatMoney(stock.current_price)}</td>
                                  <td style={{ padding: '12px 15px', textAlign: 'right', color: '#666' }}>{stock.daily_open ? formatMoney(stock.daily_open) : '—'}</td>
                                  <td style={{ padding: '12px 15px', textAlign: 'right', color: '#28a745', fontWeight: '500' }}>{stock.day_high ? formatMoney(stock.day_high) : '—'}</td>
                                  <td style={{ padding: '12px 15px', textAlign: 'right', color: '#dc3545', fontWeight: '500' }}>{stock.day_low ? formatMoney(stock.day_low) : '—'}</td>
                                  <td style={{ padding: '12px 15px', textAlign: 'right' }}>{stock.volume ? Number(stock.volume).toLocaleString() : '—'}</td>
                                  <td style={{ padding: '12px 15px', textAlign: 'right', fontWeight: '500' }}>{stock.market_cap ? '$' + (Number(stock.market_cap) >= 1e9 ? (Number(stock.market_cap)/1e9).toFixed(2) + 'B' : Number(stock.market_cap) >= 1e6 ? (Number(stock.market_cap)/1e6).toFixed(2) + 'M' : Number(stock.market_cap).toLocaleString()) : '—'}</td>
                                  <td style={{ padding: '12px 15px', textAlign: 'right' }}><ChangeIndicator val={stock.today_pct} isPercent /></td>
                                  <td style={{ padding: '12px 15px', textAlign: 'center' }}><button onClick={() => openBuyModal(stock)} style={{ padding: '6px 12px', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>Buy</button></td>
                              </tr>
                          )))}
                      </tbody>
                  </table>
              </div>
            </>
        ) : (
            // HISTORY VIEW
            <>
            <div style={{ background: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden', minHeight:'300px', marginBottom:'30px' }}>
                <div style={{ padding: '20px 25px', borderBottom: '1px solid #eee', display:'flex', justifyContent:'space-between', alignItems:'center' }}><h3 style={{ margin: 0 }}>📈 Stock Trades</h3><button onClick={()=>{loadHistory(user.id || user.user_id); loadWalletHistory(user.id || user.user_id);}} style={{background:'none', border:'1px solid #ddd', borderRadius:'4px', padding:'5px 10px', cursor:'pointer', fontSize:'12px'}}>Refresh All</button></div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                    <thead style={{ background: '#f8f9fa', borderBottom: '2px solid #e1e4e8' }}>
                        <tr><th style={{ textAlign: 'left', padding: '12px 15px' }}>Date/Time</th><th style={{ textAlign: 'left', padding: '12px 15px' }}>Type</th><th style={{ textAlign: 'left', padding: '12px 15px' }}>Symbol</th><th style={{ textAlign: 'left', padding: '12px 15px' }}>Quantity</th><th style={{ textAlign: 'left', padding: '12px 15px' }}>Price Executed</th><th style={{ textAlign: 'left', padding: '12px 15px' }}>Total Amount</th></tr>
                    </thead>
                    <tbody>
                        {history.length === 0 ? (<tr><td colSpan="6" style={{ padding: '40px', textAlign: 'center', color: '#999' }}>No stock trades found.</td></tr>) : (history.map((tx) => (
                            <tr key={tx.order_id} style={{ borderBottom: '1px solid #eee' }}>
                                <td style={{ padding: '12px 15px' }}>{formatDate(tx.created_at)}</td>
                                <td style={{ padding: '12px 15px' }}><span style={{ padding:'4px 8px', borderRadius:'4px', fontSize:'11px', fontWeight:'bold', background: tx.order_type === 'BUY' ? '#d4edda' : '#f8d7da', color: tx.order_type === 'BUY' ? '#155724' : '#721c24' }}>{tx.order_type}</span></td>
                                <td style={{ padding: '12px 15px', fontWeight:'bold', color:'#007bff' }}>{tx.ticker}</td>
                                <td style={{ padding: '12px 15px' }}>{tx.quantity}</td>
                                <td style={{ padding: '12px 15px' }}>{formatMoney(tx.price_executed)}</td>
                                <td style={{ padding: '12px 15px', fontWeight:'bold' }}>{formatMoney(tx.total_amount)}</td>
                            </tr>
                        )))}
                    </tbody>
                </table>
            </div>

            {/* WALLET ACTIVITY SECTION */}
            <div style={{ background: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden', minHeight:'200px' }}>
                <div style={{ padding: '20px 25px', borderBottom: '1px solid #eee' }}><h3 style={{ margin: 0 }}>💰 Wallet Activity</h3></div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                    <thead style={{ background: '#f8f9fa', borderBottom: '2px solid #e1e4e8' }}>
                        <tr>
                            <th style={{ textAlign: 'left', padding: '12px 15px' }}>Date/Time</th>
                            <th style={{ textAlign: 'left', padding: '12px 15px' }}>Type</th>
                            <th style={{ textAlign: 'left', padding: '12px 15px' }}>Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        {walletHistory.length === 0 ? (
                            <tr><td colSpan="3" style={{ padding: '40px', textAlign: 'center', color: '#999' }}>No wallet transactions found.</td></tr>
                        ) : (
                            walletHistory.map((wt) => (
                                <tr key={wt.transaction_id} style={{ borderBottom: '1px solid #eee' }}>
                                    <td style={{ padding: '12px 15px' }}>{formatDate(wt.created_at)}</td>
                                    <td style={{ padding: '12px 15px' }}>
                                        <span style={{ 
                                            padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold',
                                            background: wt.transaction_type === 'DEPOSIT' ? '#d4edda' : '#fff3cd',
                                            color: wt.transaction_type === 'DEPOSIT' ? '#155724' : '#856404'
                                        }}>
                                            {wt.transaction_type === 'DEPOSIT' ? '↓ DEPOSIT' : '↑ WITHDRAW'}
                                        </span>
                                    </td>
                                    <td style={{ padding: '12px 15px', fontWeight: 'bold', color: wt.transaction_type === 'DEPOSIT' ? '#28a745' : '#dc3545' }}>
                                        {wt.transaction_type === 'DEPOSIT' ? '+' : '-'}{formatMoney(wt.amount)}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
            </>
        )}
      </div>

      {/* MODAL 1: HIGH VALUE WARNING */}
      {showHighValueWarning && (
           <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
              <div style={{ background: 'white', padding: '30px', borderRadius: '12px', width: '350px', boxShadow: '0 20px 50px rgba(0,0,0,0.5)', borderTop: '6px solid #ffc107', textAlign: 'center' }}>
                  <div style={{fontSize:'40px', marginBottom:'10px'}}>⚠️</div>
                  <h2 style={{margin:'0 0 10px 0', color:'#333'}}>High Value Trade</h2>
                  <p style={{color:'#666', fontSize:'14px', lineHeight:'1.5'}}>Trade value over <strong>$10,000.00</strong>.<br/>Confirm to proceed.</p>
                  <div style={{background:'#f8f9fa', padding:'10px', borderRadius:'6px', marginBottom:'20px', fontWeight:'bold', fontSize:'18px'}}>{formatMoney(selectedStock ? selectedStock.current_price * quantity : 0)}</div>
                  <div style={{display:'flex', gap:'10px', justifyContent:'center'}}>
                      <button onClick={queueTrade} style={{ width: '100%', padding: '12px', background:'#ffc107', color:'#000', border:'none', borderRadius:'4px', cursor:'pointer', fontSize:'16px', fontWeight:'600' }}>Yes, Confirm</button>
                      <button onClick={() => setShowHighValueWarning(false)} style={{ width: '100%', padding: '12px', background:'#6c757d', color:'white', border:'none', borderRadius:'4px', cursor:'pointer', fontSize:'16px', fontWeight:'600' }}>Cancel</button>
                  </div>
              </div>
           </div>
      )}

      {/* MODAL 2: BUY/SELL STOCK */}
      {selectedStock && !showHighValueWarning && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
              <div style={{ background: 'white', padding: '30px', borderRadius: '12px', width: '400px', boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}>
                  <h2 style={{marginTop:0, color: modalMode === 'BUY' ? '#28a745' : '#dc3545'}}>{modalMode === 'BUY' ? 'Buy' : 'Sell'} {selectedStock.ticker}</h2>
                  
                  {/* Market Closed Warning */}
                  {!marketCheck.allowed && (
                      <div style={{ padding: '12px 15px', background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '8px', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontSize: '20px' }}>🚫</span>
                          <div>
                              <div style={{ fontWeight: 'bold', color: '#856404', fontSize: '13px' }}>Trading Suspended</div>
                              <div style={{ fontSize: '12px', color: '#856404' }}>{marketCheck.reason}</div>
                          </div>
                      </div>
                  )}
                  <div style={{padding:'15px', background:'#f8f9fa', borderRadius:'8px', marginBottom:'20px'}}>
                       <div style={{display:'flex', justifyContent:'space-between', marginBottom:'10px'}}><span>Price:</span><strong>{formatMoney(selectedStock.current_price)}</strong></div>
                       <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:'10px'}}>
                           <span>Quantity:</span>
                           <div style={{display:'flex', gap:'5px'}}><input type="number" min="1" value={quantity} onChange={e=>setQuantity(e.target.value)} style={{width:'80px', padding:'5px'}} />{modalMode === 'SELL' && (<button onClick={setMaxSell} style={{fontSize:'10px', padding:'2px 5px', background:'#dc3545', color:'white', border:'none', borderRadius:'3px', cursor:'pointer'}}>MAX</button>)}</div>
                       </div>
                       <div style={{borderTop:'1px solid #ddd', marginTop:'15px', paddingTop:'15px', display:'flex', justifyContent:'space-between', fontWeight:'bold'}}><span>Total:</span><span style={{color: canTrade ? '#333' : '#dc3545'}}>{formatMoney(tradeValue)}</span></div>
                       {!canTrade && <div style={{fontSize:'12px', color:'#dc3545', marginTop:'5px', textAlign:'right'}}>{errorReason}</div>}
                  </div>
                  <div style={{display:'flex', gap:'10px'}}>
                      <button onClick={initiateTradeCheck} disabled={!canTrade} style={{ width: '100%', padding: '12px', background: !canTrade ? '#ccc' : (modalMode === 'BUY' ? '#28a745' : '#dc3545'), color: 'white', border: 'none', borderRadius: '4px', cursor: canTrade ? 'pointer' : 'not-allowed', fontSize: '16px', fontWeight: '600' }}>Confirm {modalMode}</button>
                      <button onClick={()=>{setSelectedStock(null); setTradeMsg('')}} style={{ width: '100%', padding: '12px', background:'#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '16px', fontWeight: '600' }}>Cancel</button>
                  </div>
              </div>
          </div>
      )}

      {/* MODAL 3: WALLET (Deposit & Withdraw) */}
      {showWallet && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
              <div style={{ background: 'white', padding: '0', borderRadius: '12px', width: '420px', boxShadow: '0 20px 50px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
                  {/* Header with Balance */}
                  <div style={{ background: '#2c3e50', padding: '25px 30px', color: 'white' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                          <h2 style={{ margin: 0, fontSize: '20px' }}>💰 Wallet</h2>
                          <button onClick={() => { setShowWallet(false); setWalletMsg(''); setWalletAmount(''); setWalletMode('DEPOSIT'); }} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', fontSize: '20px', cursor: 'pointer' }}>✕</button>
                      </div>
                      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '5px' }}>Available Balance</div>
                      <div style={{ fontSize: '32px', fontWeight: 'bold' }}>{formatMoney(portfolio.cash)}</div>
                  </div>

                  {/* Deposit / Withdraw Toggle */}
                  <div style={{ display: 'flex', borderBottom: '1px solid #e1e4e8' }}>
                      <button 
                          onClick={() => { setWalletMode('DEPOSIT'); setWalletMsg(''); setWalletAmount(''); }}
                          style={{ 
                              flex: 1, padding: '14px', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px',
                              background: walletMode === 'DEPOSIT' ? '#fff' : '#f8f9fa',
                              color: walletMode === 'DEPOSIT' ? '#28a745' : '#999',
                              borderBottom: walletMode === 'DEPOSIT' ? '3px solid #28a745' : '3px solid transparent'
                          }}>
                          ↓ Deposit
                      </button>
                      <button 
                          onClick={() => { setWalletMode('WITHDRAW'); setWalletMsg(''); setWalletAmount(''); }}
                          style={{ 
                              flex: 1, padding: '14px', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px',
                              background: walletMode === 'WITHDRAW' ? '#fff' : '#f8f9fa',
                              color: walletMode === 'WITHDRAW' ? '#dc3545' : '#999',
                              borderBottom: walletMode === 'WITHDRAW' ? '3px solid #dc3545' : '3px solid transparent'
                          }}>
                          ↑ Withdraw
                      </button>
                  </div>

                  {/* Amount Input */}
                  <div style={{ padding: '25px 30px' }}>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                          {walletMode === 'DEPOSIT' ? 'Deposit Amount' : 'Withdraw Amount'}
                      </label>
                      <div style={{ position: 'relative' }}>
                          <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#999', fontSize: '18px', fontWeight: 'bold' }}>$</span>
                          <input 
                              type="number" 
                              min="1" 
                              max={walletMode === 'WITHDRAW' ? portfolio.cash : 100000}
                              value={walletAmount} 
                              onChange={e => setWalletAmount(e.target.value)} 
                              placeholder="0.00" 
                              style={{ width: '100%', padding: '14px 14px 14px 30px', boxSizing: 'border-box', border: '2px solid #e1e4e8', borderRadius: '8px', fontSize: '18px', fontWeight: 'bold' }} 
                          />
                      </div>

                      {/* Quick Amount Buttons */}
                      <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                          {(walletMode === 'DEPOSIT' ? [100, 500, 1000, 5000] : [100, 500, 1000]).map(amt => (
                              <button key={amt} onClick={() => setWalletAmount(String(amt))} style={{ flex: 1, padding: '8px', background: '#f0f2f5', border: '1px solid #e1e4e8', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', color: '#555' }}>
                                  ${amt.toLocaleString()}
                              </button>
                          ))}
                          {walletMode === 'WITHDRAW' && (
                              <button onClick={() => setWalletAmount(String(Math.floor(portfolio.cash)))} style={{ flex: 1, padding: '8px', background: '#fff3f3', border: '1px solid #f5c6cb', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', color: '#dc3545' }}>
                                  MAX
                              </button>
                          )}
                      </div>

                      {/* Validation hint */}
                      {walletMode === 'WITHDRAW' && Number(walletAmount) > portfolio.cash && (
                          <div style={{ marginTop: '10px', fontSize: '12px', color: '#dc3545', fontWeight: '600' }}>
                              ⚠️ Exceeds available balance of {formatMoney(portfolio.cash)}
                          </div>
                      )}
                      {walletMode === 'DEPOSIT' && Number(walletAmount) > 100000 && (
                          <div style={{ marginTop: '10px', fontSize: '12px', color: '#dc3545', fontWeight: '600' }}>
                              ⚠️ Max deposit is $100,000 per transaction
                          </div>
                      )}

                      {/* Status Message */}
                      {walletMsg && (
                          <div style={{ marginTop: '15px', padding: '10px', background: walletMsg.includes('✅') ? '#d4edda' : '#f8d7da', color: walletMsg.includes('✅') ? '#155724' : '#721c24', borderRadius: '6px', fontSize: '13px', fontWeight: '500' }}>
                              {walletMsg}
                          </div>
                      )}

                      {/* Action Button */}
                      <button 
                          onClick={handleWalletTransaction} 
                          disabled={!walletAmount || Number(walletAmount) <= 0 || (walletMode === 'WITHDRAW' && Number(walletAmount) > portfolio.cash)}
                          style={{ 
                              width: '100%', padding: '14px', marginTop: '20px',
                              background: (!walletAmount || Number(walletAmount) <= 0 || (walletMode === 'WITHDRAW' && Number(walletAmount) > portfolio.cash)) 
                                  ? '#ccc' 
                                  : (walletMode === 'DEPOSIT' ? '#28a745' : '#dc3545'), 
                              color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '16px', fontWeight: '700',
                              transition: 'background 0.2s'
                          }}>
                          {walletMode === 'DEPOSIT' ? '↓ Deposit Funds' : '↑ Withdraw Funds'}
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}

export default App;
