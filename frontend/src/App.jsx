import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import AdminDashboard from './AdminDashboard.jsx'; 

const API_BASE = 'https://stock-trading-api-fcp5.onrender.com';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(null);
  
  // NAVIGATION STATE
  const [view, setView] = useState('dashboard'); // 'dashboard', 'history', 'admin'
  
  // DATA STATES
  const [portfolio, setPortfolio] = useState({ cash: 0, stockValue: 0, totalValue: 0, dayChange: 0, dayChangePct: 0, recentActivity: null }); 
  const [holdings, setHoldings] = useState([]);     
  const [market, setMarket] = useState([]);         
  const [chartData, setChartData] = useState([]);
  const [history, setHistory] = useState([]);

  // FILTER STATE
  const [sectorFilter, setSectorFilter] = useState('All');

  // AUTH STATES
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [regSuccess, setRegSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(false); 

  // MODALS & TRADING
  const [selectedStock, setSelectedStock] = useState(null); 
  const [modalMode, setModalMode] = useState('BUY');        
  const [showWallet, setShowWallet] = useState(false);      
  const [walletAmount, setWalletAmount] = useState('');     
  const [quantity, setQuantity] = useState(1);
  const [tradeMsg, setTradeMsg] = useState('');
  const [walletMsg, setWalletMsg] = useState('');
  const [showHighValueWarning, setShowHighValueWarning] = useState(false);

  // --- INITIAL LOAD ---
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
      } catch (e) {
        handleLogout();
      }
    }
  }, [token]);

  // Load Data based on active view
  useEffect(() => {
      if(token && user) {
          if(view === 'dashboard') loadDashboard(user.id || user.user_id);
          if(view === 'history') loadHistory(user.id || user.user_id);
      }
  }, [view, token, user]);

  const loadDashboard = async (userId) => {
    setDataLoading(true);
    try {
        const [portRes, holdRes, chartRes, marketRes] = await Promise.all([
            fetch(`${API_BASE}/api/portfolio/summary/${userId}`),
            fetch(`${API_BASE}/api/portfolio/holdings/${userId}`),
            fetch(`${API_BASE}/api/portfolio/chart/${userId}`),
            fetch(`${API_BASE}/api/stocks`)
        ]);

        const portData = await portRes.json();
        const holdData = await holdRes.json();
        const chartData = await chartRes.json();
        const marketData = await marketRes.json();

        if (!portData.error) setPortfolio(portData);
        setHoldings(Array.isArray(holdData) ? holdData : []);
        setChartData(Array.isArray(chartData) ? chartData : []);
        setMarket(Array.isArray(marketData) ? marketData : []);

    } catch (err) {
        console.error("Dashboard Load Error:", err);
    } finally {
        setDataLoading(false);
    }
  };

  const loadHistory = async (userId) => {
      setDataLoading(true);
      try {
          const res = await fetch(`${API_BASE}/api/orders/history/${userId}`);
          const data = await res.json();
          setHistory(Array.isArray(data) ? data : []);
      } catch (err) {
          console.error("History Load Error:", err);
      } finally {
          setDataLoading(false);
      }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
    setView('dashboard');
  };

  const handleAdminClick = () => {
      if (user && user.is_admin) {
          setView('admin');
      } else {
          alert("⛔ Access Denied: You are not an Admin.");
      }
  };

  // --- AUTH & TRADING HANDLERS ---
  const handleAuth = async (type, e) => {
    e.preventDefault();
    setLoading(true);
    setAuthError('');
    setRegSuccess('');

    const endpoint = type === 'LOGIN' ? `${API_BASE}/api/auth/login` : `${API_BASE}/api/auth/register`;
    const payload = type === 'LOGIN' 
        ? { username: loginUsername, password: loginPassword } 
        : { username: regUsername, email: regEmail, password: regPassword };

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
        setRegSuccess('✅ Account created! Please log in on the right.');
        setRegUsername('');
        setRegEmail('');
        setRegPassword('');
      }
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const initiateTrade = () => {
      const tradeValue = selectedStock.current_price * quantity;
      if (tradeValue >= 10000) {
          setShowHighValueWarning(true);
      } else {
          executeTrade();
      }
  };

  const executeTrade = async () => {
    setShowHighValueWarning(false);
    setTradeMsg('Processing...');
    if(!user || !selectedStock) return;
    const endpoint = modalMode === 'BUY' ? '/api/orders/buy' : '/api/orders/sell';
    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            userId: user.id || user.user_id,
            stockId: selectedStock.stock_id,
            quantity: Number(quantity)
        })
      });
      const data = await res.json();
      if(res.ok) {
        setTradeMsg(`✅ ${modalMode === 'BUY' ? 'Bought' : 'Sold'} successfully!`);
        setTimeout(() => {
            setSelectedStock(null);
            setTradeMsg('');
            setQuantity(1);
            if(view === 'dashboard') loadDashboard(user.id || user.user_id);
            if(view === 'history') loadHistory(user.id || user.user_id);
        }, 1500);
      } else {
        setTradeMsg(`❌ Error: ${data.error}`);
      }
    } catch (err) {
      setTradeMsg(`❌ Error: ${err.message}`);
    }
  };

  const openBuyModal = (stock) => {
      setSelectedStock(stock);
      setModalMode('BUY');
      setQuantity(1);
      setTradeMsg('');
      setShowHighValueWarning(false);
  };

  const openSellModal = (stock) => {
      setSelectedStock(stock);
      setModalMode('SELL');
      setQuantity(1);
      setTradeMsg('');
      setShowHighValueWarning(false);
  };

  const setMaxSell = () => {
      const ownedStock = holdings.find(h => h.stock_id === selectedStock?.stock_id);
      if(ownedStock) {
          setQuantity(Number(ownedStock.quantity));
      }
  };

  const handleAddFunds = async () => {
      setWalletMsg('Processing...');
      try {
          const res = await fetch(`${API_BASE}/api/wallet/add`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  userId: user.id || user.user_id,
                  amount: Number(walletAmount)
              })
          });
          const data = await res.json();
          if (res.ok) {
              setWalletMsg(`✅ ${data.message}`);
              setTimeout(() => {
                  setShowWallet(false);
                  setWalletMsg('');
                  setWalletAmount('');
                  loadDashboard(user.id || user.user_id); 
              }, 1500);
          } else {
              setWalletMsg(`❌ ${data.error}`);
          }
      } catch (err) {
          setWalletMsg(`❌ Error: ${err.message}`);
      }
  };

  // FORMATTERS
  const formatMoney = (num) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num || 0);
  const formatDate = (dateStr) => { if(!dateStr) return '-'; return new Date(dateStr).toLocaleString(); }
  const ChangeIndicator = ({ val, isPercent }) => {
     if(!val || val === 0) return <span style={{color:'#999', fontSize:'12px'}}>-</span >;
     const color = val > 0 ? '#28a745' : '#dc3545';
     const sign = val > 0 ? '+' : '';
     return <span style={{color, fontWeight:'bold'}}>{sign}{isPercent ? Number(val).toFixed(2) + '%' : formatMoney(val)}</span>;
  };
  const LoadingSpinner = () => (
      <div style={{ marginLeft: '40px', marginTop: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div className="spinner"></div> 
          <span style={{ fontSize: '13px', color: '#666', fontWeight: 'bold' }}>LOADING DATA...</span>
          <style>{`
            .spinner { width: 20px; height: 20px; border: 3px solid #f3f3f3; border-top: 3px solid #3498db; border-radius: 50%; animation: spin 1s linear infinite; }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          `}</style>
      </div>
  );

  // Filter Logic
  const filteredMarket = market.filter(s => sectorFilter === 'All' || s.sector === sectorFilter);

  if (token && view === 'admin') {
      return <AdminDashboard onBack={() => setView('dashboard')} onLoginAs={(u)=>{ setUser(u); setView('dashboard'); loadDashboard(u.user_id); }} />;
  }

  // --- LOGGED IN LAYOUT ---
  if (token) {
    const isAdmin = user?.is_admin;
    const tradeValue = selectedStock ? selectedStock.current_price * quantity : 0;
    const buyingPowerUsed = portfolio.cash > 0 ? (tradeValue / portfolio.cash) * 100 : 0;
    
    let canTrade = true;
    let errorReason = "";
    const ownedStock = holdings.find(h => h.stock_id === selectedStock?.stock_id);
    const ownedQty = ownedStock ? Number(ownedStock.quantity) : 0;

    if (modalMode === 'BUY') {
        if (tradeValue > portfolio.cash) { canTrade = false; errorReason = `Insufficient Cash`; }
    } else {
        if (quantity > ownedQty) { canTrade = false; errorReason = `Insufficient Shares`; }
    }

    return (
      <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', background: '#f4f6f9', minHeight: '100vh', paddingBottom: '50px' }}>
        
        {/* HEADER */}
        <div style={{ background: '#fff', padding: '15px 40px', borderBottom: '1px solid #e1e4e8', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: '32px', fontWeight: '900', letterSpacing: '1px' }}><span style={{ color: '#d32f2f' }}>C</span><span style={{ color: '#1565c0' }}>D</span><span style={{ color: '#2e7d32' }}>M</span></div>
            <div style={{ display:'flex', flexDirection:'column', justifyContent:'center' }}><span style={{ fontSize: '20px', fontWeight: '800', color: '#2c3e50', lineHeight:'1', letterSpacing:'-0.5px' }}>ProTrader</span><span style={{ fontSize: '11px', fontWeight: '400', color: '#95a5a6', textTransform:'uppercase', letterSpacing:'2px' }}>Dashboard</span></div>
          </div>
          
          <div style={{display:'flex', gap:'20px'}}>
              <div onClick={() => setView('dashboard')} style={{cursor:'pointer', padding:'10px', borderBottom: view === 'dashboard' ? '3px solid #007bff' : 'none', fontWeight: view === 'dashboard' ? 'bold' : 'normal', color: view === 'dashboard' ? '#007bff' : '#666'}}>Dashboard</div>
              <div onClick={() => setView('history')} style={{cursor:'pointer', padding:'10px', borderBottom: view === 'history' ? '3px solid #007bff' : 'none', fontWeight: view === 'history' ? 'bold' : 'normal', color: view === 'history' ? '#007bff' : '#666'}}>History</div>
          </div>

          <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
            <button onClick={() => setShowWallet(true)} style={{ padding: '8px 16px', fontSize: '13px', background: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px' }}>💰 Wallet</button>
            {isAdmin && (
                <button onClick={handleAdminClick} style={{ padding: '8px 16px', fontSize: '13px', background: '#343a40', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px' }}>🔒 Admin Panel</button>
            )}
            <div style={{borderLeft:'1px solid #ddd', height:'25px'}}></div>
            <span style={{ fontSize: '14px', fontWeight: '600', color: '#555' }}>{user?.username}</span>
            <button onClick={handleLogout} style={{ padding: '6px 12px', fontSize: '13px', background: 'none', border: '1px solid #d1d5da', borderRadius: '4px', cursor: 'pointer', color:'#666' }}>Logout</button>
          </div>
        </div>

        {dataLoading && <LoadingSpinner />}

        {/* --- DASHBOARD VIEW --- */}
        <div style={{ maxWidth: '1400px', margin: '30px auto', padding: '0 20px' }}>
          
          {view === 'dashboard' ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '30px' }}>
                    <MetricCard title="Cash Available" value={formatMoney(portfolio.cash)} sub="Buying Power" />
                    <MetricCard title="Net Account Value" value={formatMoney(portfolio.totalValue)} sub="Cash + Holdings" highlight />
                    <div style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                        <div style={{ fontSize: '12px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Day's Change</div>
                        <div style={{ fontSize: '24px', fontWeight: 'bold', marginTop: '5px' }}><ChangeIndicator val={portfolio.dayChange} /></div>
                        <div style={{ fontSize: '13px', marginTop: '2px' }}><ChangeIndicator val={portfolio.dayChangePct} isPercent /></div>
                    </div>
                </div>

                <div style={{ background: 'white', padding: '25px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '30px' }}>
                    <h3 style={{ marginTop: 0, marginBottom: '20px', fontSize: '18px', color: '#333' }}>Portfolio Performance (30 Day)</h3>
                    <div style={{ height: '300px', width: '100%' }}>
                        <ResponsiveContainer>
                            <AreaChart data={chartData}>
                                <defs><linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#007bff" stopOpacity={0.1}/><stop offset="95%" stopColor="#007bff" stopOpacity={0}/></linearGradient></defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                                <XAxis dataKey="day" hide />
                                <YAxis domain={['auto', 'auto']} tickFormatter={(val) => `$${val/1000}k`} stroke="#999" fontSize={12} />
                                <Tooltip formatter={(val) => formatMoney(val)} labelFormatter={(label) => `Day ${label}`} />
                                <Area type="monotone" dataKey="value" stroke="#007bff" strokeWidth={2} fillOpacity={1} fill="url(#colorVal)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* HOLDINGS */}
                <div style={{ background: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden', marginBottom:'30px' }}>
                    <div style={{ padding: '15px 25px', borderBottom: '1px solid #eee' }}><h3 style={{ margin: 0 }}>My Positions</h3></div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                        <thead style={{ background: '#f8f9fa', borderBottom: '2px solid #e1e4e8' }}>
                            <tr>
                                <th style={thStyle}>Symbol</th><th style={thStyle}>Last Price</th><th style={thStyle}>Day Change</th><th style={thStyle}>Total Gain/Loss</th><th style={thStyle}>Current Value</th><th style={thStyle}>Quantity</th><th style={thStyle}>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {holdings.length === 0 ? (<tr><td colSpan="7" style={{ padding: '30px', textAlign: 'center', color: '#999' }}>No positions held. Check the Market below!</td></tr>) : (holdings.map(stock => (
                                <tr key={stock.stock_id} style={{ borderBottom: '1px solid #eee' }}>
                                    <td style={{...tdStyle, fontWeight: 'bold', color: '#007bff'}}>{stock.ticker}</td>
                                    <td style={tdStyle}>{formatMoney(stock.current_price)}</td>
                                    <td style={tdStyle}><ChangeIndicator val={stock.day_change} isPercent /></td>
                                    <td style={tdStyle}><ChangeIndicator val={stock.total_gain} /></td>
                                    <td style={{...tdStyle, fontWeight:'bold'}}>{formatMoney(stock.market_value)}</td>
                                    <td style={tdStyle}>{stock.quantity}</td>
                                    <td style={tdStyle}><div style={{display:'flex', gap:'5px'}}><button onClick={() => openBuyModal(stock)} style={{...btnSmall, background: '#28a745'}}>Buy</button><button onClick={() => openSellModal(stock)} style={{...btnSmall, background: '#dc3545'}}>Sell</button></div></td>
                                </tr>
                            )))}
                        </tbody>
                    </table>
                </div>

                {/* MARKET DATA */}
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
                            </select>
                        </div>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                        <thead style={{ background: '#f8f9fa', borderBottom: '2px solid #e1e4e8' }}>
                            <tr>
                                <th style={thStyle}>Symbol</th><th style={{...thStyle, width: '200px'}}>Company</th><th style={thStyle}>Sector</th><th style={thStyle}>Volatility</th><th style={thStyle}>Price</th><th style={thStyle}>Today %</th><th style={thStyle}>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredMarket.length === 0 ? (<tr><td colSpan="7" style={{ padding: '20px', textAlign: 'center' }}>Loading or No Stocks in this Sector...</td></tr>) : (filteredMarket.map(stock => (
                                <tr key={stock.stock_id} style={{ borderBottom: '1px solid #eee' }}>
                                    <td style={{...tdStyle, fontWeight: 'bold', color: '#007bff'}}>{stock.ticker}</td>
                                    <td style={{...tdStyle, maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{stock.company_name}</td>
                                    <td style={tdStyle}><span style={{background:'#eaf5ff', color:'#0366d6', padding:'2px 6px', borderRadius:'10px', fontSize:'11px'}}>{stock.sector}</span></td>
                                    <td style={tdStyle}>
                                        {Number(stock.volatility) > 0.04 ? (
                                            <span style={{background:'#fff3cd', color:'#856404', padding:'2px 6px', borderRadius:'4px', fontSize:'11px', fontWeight:'bold'}}>⚡ High Risk</span>
                                        ) : (
                                            <span style={{color:'#999', fontSize:'11px'}}>Stable</span>
                                        )}
                                    </td>
                                    <td style={{...tdStyle, fontWeight:'bold'}}>{formatMoney(stock.current_price)}</td>
                                    <td style={tdStyle}><ChangeIndicator val={stock.today_pct} isPercent /></td>
                                    <td style={tdStyle}><button onClick={() => openBuyModal(stock)} style={btnSmall}>Buy</button></td>
                                </tr>
                            )))}
                        </tbody>
                    </table>
                </div>
              </>
          ) : (
              // --- HISTORY VIEW ---
              <div style={{ background: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden', minHeight:'500px' }}>
                  <div style={{ padding: '20px 25px', borderBottom: '1px solid #eee', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <h3 style={{ margin: 0 }}>Transaction History</h3>
                      <button onClick={()=>loadHistory(user.id || user.user_id)} style={{background:'none', border:'1px solid #ddd', borderRadius:'4px', padding:'5px 10px', cursor:'pointer', fontSize:'12px'}}>Refresh</button>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                      <thead style={{ background: '#f8f9fa', borderBottom: '2px solid #e1e4e8' }}>
                          <tr>
                              <th style={thStyle}>Date/Time</th>
                              <th style={thStyle}>Type</th>
                              <th style={thStyle}>Symbol</th>
                              <th style={thStyle}>Quantity</th>
                              <th style={thStyle}>Price Executed</th>
                              <th style={thStyle}>Total Amount</th>
                          </tr>
                      </thead>
                      <tbody>
                          {history.length === 0 ? (
                              <tr><td colSpan="6" style={{ padding: '40px', textAlign: 'center', color: '#999' }}>No transactions found. Make a trade!</td></tr>
                          ) : (
                              history.map((tx) => (
                                  <tr key={tx.order_id} style={{ borderBottom: '1px solid #eee' }}>
                                      <td style={tdStyle}>{formatDate(tx.created_at)}</td>
                                      <td style={tdStyle}>
                                          <span style={{
                                              padding:'4px 8px', borderRadius:'4px', fontSize:'11px', fontWeight:'bold',
                                              background: tx.order_type === 'BUY' ? '#d4edda' : '#f8d7da',
                                              color: tx.order_type === 'BUY' ? '#155724' : '#721c24'
                                          }}>
                                              {tx.order_type}
                                          </span>
                                      </td>
                                      <td style={{...tdStyle, fontWeight:'bold', color:'#007bff'}}>{tx.ticker}</td>
                                      <td style={tdStyle}>{tx.quantity}</td>
                                      <td style={tdStyle}>{formatMoney(tx.price_executed)}</td>
                                      <td style={{...tdStyle, fontWeight:'bold'}}>{formatMoney(tx.total_amount)}</td>
                                  </tr>
                              ))
                          )}
                      </tbody>
                  </table>
              </div>
          )}

        </div>

        {/* MODALS (Trade, Wallet, HighValue) */}
        {showHighValueWarning && (
             <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
                <div style={{ background: 'white', padding: '30px', borderRadius: '12px', width: '350px', boxShadow: '0 20px 50px rgba(0,0,0,0.5)', borderTop: '6px solid #ffc107', textAlign: 'center' }}>
                    <div style={{fontSize:'40px', marginBottom:'10px'}}>⚠️</div>
                    <h2 style={{margin:'0 0 10px 0', color:'#333'}}>High Value Trade</h2>
                    <p style={{color:'#666', fontSize:'14px', lineHeight:'1.5'}}>You are about to place a trade valued over <strong>$10,000.00</strong>.<br/>Please confirm you wish to proceed.</p>
                    <div style={{background:'#f8f9fa', padding:'10px', borderRadius:'6px', marginBottom:'20px', fontWeight:'bold', fontSize:'18px'}}>{formatMoney(selectedStock ? selectedStock.current_price * quantity : 0)}</div>
                    <div style={{display:'flex', gap:'10px', justifyContent:'center'}}>
                        <button onClick={executeTrade} style={{...btnBig, background:'#ffc107', color:'#000'}}>Yes, Confirm</button>
                        <button onClick={() => setShowHighValueWarning(false)} style={{...btnBig, background:'#6c757d', color:'white'}}>Cancel</button>
                    </div>
                </div>
             </div>
        )}

        {selectedStock && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                <div style={{ background: 'white', padding: '30px', borderRadius: '12px', width: '400px', boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}>
                    <h2 style={{marginTop:0, color: modalMode === 'BUY' ? '#28a745' : '#dc3545'}}>{modalMode === 'BUY' ? 'Buy' : 'Sell'} {selectedStock.ticker}</h2>
                    <div style={{padding:'15px', background:'#f8f9fa', borderRadius:'8px', marginBottom:'20px'}}>
                         <div style={{display:'flex', justifyContent:'space-between', marginBottom:'10px'}}><span>Current Price:</span><strong>{formatMoney(selectedStock.current_price)}</strong></div>
                         <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:'10px'}}>
                             <span>Quantity:</span>
                             <div style={{display:'flex', gap:'5px'}}>
                                <input type="number" min="1" value={quantity} onChange={e=>setQuantity(e.target.value)} style={{width:'80px', padding:'5px'}} />
                                {modalMode === 'SELL' && (<button onClick={setMaxSell} style={{fontSize:'10px', padding:'2px 5px', background:'#dc3545', color:'white', border:'none', borderRadius:'3px', cursor:'pointer'}}>MAX</button>)}
                             </div>
                         </div>
                         <div style={{borderTop:'1px solid #ddd', marginTop:'15px', paddingTop:'15px', display:'flex', justifyContent:'space-between', fontWeight:'bold'}}><span>Total Value:</span><span style={{color: canTrade ? '#333' : '#dc3545', fontWeight:'bold'}}>{formatMoney(tradeValue)}</span></div>
                         {!canTrade && <div style={{fontSize:'12px', color:'#dc3545', marginTop:'5px', textAlign:'right'}}>{errorReason}</div>}
                    </div>
                    {tradeMsg && <div style={{marginBottom:'15px', color: tradeMsg.includes('Success')?'green':'red', textAlign:'center'}}>{tradeMsg}</div>}
                    <div style={{display:'flex', gap:'10px'}}>
                        <button onClick={initiateTrade} disabled={!canTrade} style={{...btnBig, background: !canTrade ? '#ccc' : (modalMode === 'BUY' ? '#28a745' : '#dc3545'), cursor: canTrade ? 'pointer' : 'not-allowed'}}>Confirm {modalMode}</button>
                        <button onClick={()=>{setSelectedStock(null); setTradeMsg('')}} style={{...btnBig, background:'#6c757d'}}>Cancel</button>
                    </div>
                </div>
            </div>
        )}

        {showWallet && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                <div style={{ background: 'white', padding: '30px', borderRadius: '12px', width: '400px', boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}>
                    <h2 style={{marginTop:0, display:'flex', alignItems:'center', gap:'10px'}}>💰 Add Funds</h2>
                    <div style={{padding:'15px', background:'#f8f9fa', borderRadius:'8px', marginBottom:'20px'}}>
                         <div style={{display:'flex', justifyContent:'space-between', marginBottom:'10px'}}><span>Current Balance:</span><strong>{formatMoney(portfolio.cash)}</strong></div>
                         <div style={{marginBottom:'10px'}}>
                             <label style={{display:'block', marginBottom:'5px', fontSize:'13px', fontWeight:'bold'}}>Amount to Add ($)</label>
                             <input type="number" max="100000" value={walletAmount} onChange={e=>setWalletAmount(e.target.value)} placeholder="e.g. 5000" style={{width:'100%', padding:'10px', boxSizing:'border-box', border:'1px solid #ccc', borderRadius:'4px'}} />
                         </div>
                    </div>
                    {walletMsg && <div style={{marginBottom:'15px', padding:'10px', background: walletMsg.includes('Success')?'#d4edda':'#f8d7da', color: walletMsg.includes('Success')?'#155724':'#721c24', borderRadius:'4px', fontSize:'13px'}}>{walletMsg}</div>}
                    <div style={{display:'flex', gap:'10px'}}>
                        <button onClick={handleAddFunds} style={{...btnBig, background:'#007bff'}}>Deposit Funds</button>
                        <button onClick={()=>{setShowWallet(false); setWalletMsg(''); setWalletAmount('')}} style={{...btnBig, background:'#6c757d'}}>Cancel</button>
                    </div>
                </div>
            </div>
        )}
      </div>
    );
  }

  // --- SPLIT AUTH SCREEN ---
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#e9ecef', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', width: '900px', height: '600px', background: 'white', borderRadius: '20px', boxShadow: '0 20px 50px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
            <div style={{ flex: 1, background: '#2c3e50', padding: '50px', display: 'flex', flexDirection: 'column', justifyContent: 'center', color: 'white', position: 'relative' }}>
                <div style={{ position: 'absolute', top: '30px', left: '30px', fontFamily: 'Georgia, serif', fontSize: '24px', fontWeight: 'bold' }}><span style={{ color: '#e74c3c' }}>C</span><span style={{ color: '#3498db' }}>D</span><span style={{ color: '#2ecc71' }}>M</span></div>
                <h2 style={{ fontSize: '28px', marginBottom: '10px' }}>Create Profile</h2>
                <p style={{ color: '#bdc3c7', marginBottom: '30px', lineHeight: '1.5' }}>Join the market simulation today. Build your portfolio and compete with real-time data.</p>
                <form onSubmit={(e) => handleAuth('REGISTER', e)}>
                    <input style={darkInput} type="text" placeholder="Choose Username" value={regUsername} onChange={e=>setRegUsername(e.target.value)} />
                    <input style={darkInput} type="email" placeholder="Email Address" value={regEmail} onChange={e=>setRegEmail(e.target.value)} />
                    <input style={darkInput} type="password" placeholder="Create Password" value={regPassword} onChange={e=>setRegPassword(e.target.value)} />
                    <button type="submit" style={btnRegister} disabled={loading}>{loading ? 'Creating...' : 'Sign Up Now'}</button>
                </form>
                {authError && <div style={{ marginTop: '15px', color: '#e74c3c', fontSize: '13px' }}>{authError}</div>}
                {regSuccess && <div style={{ marginTop: '15px', color: '#2ecc71', fontSize: '13px', fontWeight: 'bold' }}>{regSuccess}</div>}
            </div>
            <div style={{ flex: 1, padding: '50px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                <h2 style={{ color: '#2c3e50', marginBottom: '30px', fontSize: '24px' }}>Welcome Back</h2>
                <form onSubmit={(e) => handleAuth('LOGIN', e)} style={{ width: '100%' }}>
                    <div style={{ marginBottom: '15px' }}><label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#7f8c8d', marginBottom: '5px', textTransform: 'uppercase' }}>Username</label><input style={lightInput} type="text" value={loginUsername} onChange={e=>setLoginUsername(e.target.value)} /></div>
                    <div style={{ marginBottom: '25px' }}><label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#7f8c8d', marginBottom: '5px', textTransform: 'uppercase' }}>Password</label><input style={lightInput} type="password" value={loginPassword} onChange={e=>setLoginPassword(e.target.value)} /></div>
                    <button type="submit" style={btnLogin} disabled={loading}>{loading ? 'Logging in...' : 'Log In'}</button>
                </form>
            </div>
        </div>
    </div>
  );
}

// --- STYLES ---
const MetricCard = ({ title, value, sub, color, highlight }) => (
    <div style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: highlight ? '0 4px 12px rgba(0,123,255,0.2)' : '0 1px 3px rgba(0,0,0,0.1)', borderTop: highlight ? '4px solid #007bff' : 'none' }}>
        <div style={{ fontSize: '12px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{title}</div>
        <div style={{ fontSize: '24px', fontWeight: 'bold', marginTop: '5px', color: color || '#333' }}>{value}</div>
        <div style={{ fontSize: '13px', color: '#666', marginTop: '2px' }}>{sub}</div>
    </div>
);
const thStyle = { textAlign: 'left', padding: '12px 15px', color: '#444', fontWeight: '600', fontSize: '13px' };
const tdStyle = { padding: '12px 15px', color: '#333' };
const btnSmall = { padding: '6px 12px', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' };
const btnBig = { width: '100%', padding: '12px', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '16px', fontWeight: '600' };
const darkInput = { width: '100%', padding: '12px', marginBottom: '15px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', color: 'white', boxSizing: 'border-box' };
const lightInput = { width: '100%', padding: '12px', background: '#f8f9fa', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box', fontSize: '14px' };
const btnRegister = { width: '100%', padding: '12px', background: '#e74c3c', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', marginTop: '10px' };
const btnLogin = { width: '100%', padding: '12px', background: '#2c3e50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 5px 15px rgba(44, 62, 80, 0.3)' };

export default App;
