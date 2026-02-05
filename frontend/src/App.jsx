import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import AdminDashboard from './AdminDashboard.jsx'; 

// CONFIRMED API URL
const API_BASE = 'https://stock-trading-api-fcp5.onrender.com';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(null);
  const [view, setView] = useState('dashboard');
  
  // DATA STATES
  const [portfolio, setPortfolio] = useState({ cash: 0, stockValue: 0, totalValue: 0, dayChange: 0, dayChangePct: 0, recentActivity: null }); 
  const [holdings, setHoldings] = useState([]);     
  const [market, setMarket] = useState([]);         
  const [chartData, setChartData] = useState([]);   

  // UI STATES
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(false); 

  // MODALS
  const [selectedStock, setSelectedStock] = useState(null); 
  const [modalMode, setModalMode] = useState('BUY');        // 'BUY' or 'SELL'
  const [showWallet, setShowWallet] = useState(false);      
  const [walletAmount, setWalletAmount] = useState('');     
  const [quantity, setQuantity] = useState(1);
  const [tradeMsg, setTradeMsg] = useState('');
  const [walletMsg, setWalletMsg] = useState('');

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

  const handleLoginAs = (targetUser) => {
    setUser(targetUser); 
    loadDashboard(targetUser.user_id);
    setView('dashboard'); 
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const endpoint = isLogin ? `${API_BASE}/api/auth/login` : `${API_BASE}/api/auth/register`;
    const payload = isLogin ? { username, password } : { username, email, password };

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (isLogin) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        setToken(data.token);
        setUser(data.user);
        loadDashboard(data.user.id);
      } else {
        setIsLogin(true);
        setError('Success! Please log in.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // --- UNIVERSAL TRADE HANDLER (BUY & SELL) ---
  const handleTrade = async () => {
    setTradeMsg('Processing...');
    if(!user || !selectedStock) return;

    // Determine endpoint based on mode
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
        // Optimistic UI Update feedback
        setTradeMsg(`✅ ${modalMode === 'BUY' ? 'Bought' : 'Sold'} successfully!`);
        
        // Wait briefly then refresh dashboard
        setTimeout(() => {
            setSelectedStock(null);
            setTradeMsg('');
            setQuantity(1);
            loadDashboard(user.id || user.user_id); 
        }, 1500);
      } else {
        setTradeMsg(`❌ Error: ${data.error}`);
      }
    } catch (err) {
      setTradeMsg(`❌ Error: ${err.message}`);
    }
  };

  // --- MODAL TRIGGERS ---
  const openBuyModal = (stock) => {
      setSelectedStock(stock);
      setModalMode('BUY');
      setQuantity(1);
      setTradeMsg('');
  };

  const openSellModal = (stock) => {
      setSelectedStock(stock);
      setModalMode('SELL');
      setQuantity(1);
      setTradeMsg('');
  };

  const setMaxSell = () => {
      const ownedStock = holdings.find(h => h.stock_id === selectedStock?.stock_id);
      if(ownedStock) {
          setQuantity(Number(ownedStock.quantity));
      }
  };

  // --- WALLET HANDLER ---
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

  const formatMoney = (num) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num || 0);
  
  const ChangeIndicator = ({ val, isPercent }) => {
     if(!val || val === 0) return <span style={{color:'#999', fontSize:'12px'}}>-</span >;
     const color = val > 0 ? '#28a745' : '#dc3545';
     const sign = val > 0 ? '+' : '';
     return <span style={{color, fontWeight:'bold'}}>{sign}{isPercent ? Number(val).toFixed(2) + '%' : formatMoney(val)}</span>;
  };

  const LoadingSpinner = () => (
      <div style={{ marginLeft: '40px', marginTop: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div className="spinner"></div> 
          <span style={{ fontSize: '13px', color: '#666', fontWeight: 'bold' }}>UPDATING LIVE DATA...</span>
          <style>{`
            .spinner { width: 20px; height: 20px; border: 3px solid #f3f3f3; border-top: 3px solid #3498db; border-radius: 50%; animation: spin 1s linear infinite; }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          `}</style>
      </div>
  );

  if (token && view === 'admin') {
      return <AdminDashboard onBack={() => setView('dashboard')} onLoginAs={handleLoginAs} />;
  }

  if (token) {
    const isAdmin = user?.is_admin;
    
    // --- VALIDATION LOGIC ---
    const tradeValue = selectedStock ? selectedStock.current_price * quantity : 0;
    let canTrade = true;
    let errorReason = "";
    
    // Check ownership for Sell Mode
    const ownedStock = holdings.find(h => h.stock_id === selectedStock?.stock_id);
    const ownedQty = ownedStock ? Number(ownedStock.quantity) : 0;

    if (modalMode === 'BUY') {
        if (tradeValue > portfolio.cash) {
            canTrade = false;
            errorReason = `Insufficient Cash (Need ${formatMoney(tradeValue)})`;
        }
    } else {
        // SELL MODE VALIDATION
        if (quantity > ownedQty) {
            canTrade = false;
            errorReason = `Insufficient Shares (You own: ${ownedQty})`;
        }
    }

    return (
      <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', background: '#f4f6f9', minHeight: '100vh', paddingBottom: '50px' }}>
        
        {/* HEADER */}
        <div style={{ background: '#fff', padding: '15px 40px', borderBottom: '1px solid #e1e4e8', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: '32px', fontWeight: '900', letterSpacing: '1px' }}><span style={{ color: '#d32f2f' }}>C</span><span style={{ color: '#1565c0' }}>D</span><span style={{ color: '#2e7d32' }}>M</span></div>
            <div style={{ display:'flex', flexDirection:'column', justifyContent:'center' }}><span style={{ fontSize: '20px', fontWeight: '800', color: '#2c3e50', lineHeight:'1', letterSpacing:'-0.5px' }}>ProTrader</span><span style={{ fontSize: '11px', fontWeight: '400', color: '#95a5a6', textTransform:'uppercase', letterSpacing:'2px' }}>Dashboard</span></div>
          </div>
          <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
            <button onClick={() => setShowWallet(true)} style={{ padding: '8px 16px', fontSize: '13px', background: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px' }}>💰 Wallet</button>
            <button onClick={handleAdminClick} style={{ padding: '8px 16px', fontSize: '13px', background: isAdmin ? '#343a40' : '#e9ecef', color: isAdmin ? '#fff' : '#adb5bd', border: 'none', borderRadius: '4px', cursor: isAdmin ? 'pointer' : 'not-allowed', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px' }}>{isAdmin ? '🔒 Admin' : '🔒 Restricted'}</button>
            <div style={{borderLeft:'1px solid #ddd', height:'25px'}}></div>
            <span style={{ fontSize: '14px', fontWeight: '600', color: '#555' }}>{user?.username}</span>
            <button onClick={handleLogout} style={{ padding: '6px 12px', fontSize: '13px', background: 'none', border: '1px solid #d1d5da', borderRadius: '4px', cursor: 'pointer', color:'#666' }}>Logout</button>
          </div>
        </div>

        {dataLoading && <LoadingSpinner />}

        <div style={{ maxWidth: '1400px', margin: '30px auto', padding: '0 20px' }}>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '30px' }}>
            <MetricCard title="Cash Available" value={formatMoney(portfolio.cash)} sub="Buying Power" />
            <MetricCard title="Net Account Value" value={formatMoney(portfolio.totalValue)} sub="Cash + Holdings" highlight />
            <div style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                <div style={{ fontSize: '12px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Day's Change</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold', marginTop: '5px' }}><ChangeIndicator val={portfolio.dayChange} /></div>
                <div style={{ fontSize: '13px', marginTop: '2px' }}><ChangeIndicator val={portfolio.dayChangePct} isPercent /></div>
            </div>
            <div style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: '4px solid #007bff' }}>
                <div style={{ fontSize: '12px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Recent Activity</div>
                <div style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '5px' }}>{portfolio.recentActivity ? `${portfolio.recentActivity.quantity} ${portfolio.recentActivity.ticker}` : 'No trades yet'}</div>
                <div style={{ fontSize: '13px', color: '#666', marginTop: '2px' }}>{portfolio.recentActivity ? `@ ${formatMoney(portfolio.recentActivity.price_executed)}` : 'Start trading now'}</div>
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

          {/* POSITIONS TABLE WITH SELL BUTTON */}
          <div style={{ background: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
            <div style={{ padding: '15px 25px', borderBottom: '1px solid #eee' }}><h3 style={{ margin: 0 }}>Positions</h3></div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead style={{ background: '#f8f9fa', borderBottom: '2px solid #e1e4e8' }}>
                    <tr>
                        <th style={thStyle}>Symbol</th><th style={thStyle}>Last Price</th><th style={thStyle}>Day Change</th><th style={thStyle}>Total Gain/Loss</th><th style={thStyle}>Current Value</th><th style={thStyle}>Quantity</th><th style={thStyle}>Avg Cost</th><th style={thStyle}>Total Cost</th><th style={thStyle}>Action</th>
                    </tr>
                </thead>
                <tbody>
                    {holdings.length === 0 ? (<tr><td colSpan="9" style={{ padding: '30px', textAlign: 'center', color: '#999' }}>No positions held. Check the Market below!</td></tr>) : (holdings.map(stock => (
                        <tr key={stock.stock_id} style={{ borderBottom: '1px solid #eee' }}>
                            <td style={{...tdStyle, fontWeight: 'bold', color: '#007bff'}}>{stock.ticker}</td>
                            <td style={tdStyle}>{formatMoney(stock.current_price)}</td>
                            <td style={tdStyle}><ChangeIndicator val={stock.day_change} isPercent /></td>
                            <td style={tdStyle}><ChangeIndicator val={stock.total_gain} /><br/><span style={{fontSize:'11px'}}><ChangeIndicator val={stock.total_gain_pct} isPercent /></span></td>
                            <td style={{...tdStyle, fontWeight:'bold'}}>{formatMoney(stock.market_value)}</td>
                            <td style={tdStyle}>{stock.quantity}</td>
                            <td style={tdStyle}>{formatMoney(stock.avg_cost)}</td>
                            <td style={tdStyle}>{formatMoney(stock.total_cost)}</td> 
                            <td style={tdStyle}>
                                {/* BUY AND SELL BUTTONS */}
                                <div style={{display:'flex', gap:'5px'}}>
                                    <button onClick={() => openBuyModal(stock)} style={{...btnSmall, background: '#28a745'}}>Buy</button>
                                    <button onClick={() => openSellModal(stock)} style={{...btnSmall, background: '#dc3545'}}>Sell</button>
                                </div>
                            </td>
                        </tr>
                    )))}
                </tbody>
            </table>
          </div>

          <br /> <br />

          {/* MARKET TABLE */}
          <div style={{ background: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
            <div style={{ padding: '15px 25px', borderBottom: '1px solid #eee' }}><h3 style={{ margin: 0 }}>Market Data</h3></div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead style={{ background: '#f8f9fa', borderBottom: '2px solid #e1e4e8' }}>
                    <tr>
                        <th style={thStyle}>Symbol</th><th style={{...thStyle, width: '200px'}}>Company</th><th style={thStyle}>Sector</th><th style={thStyle}>Price</th><th style={thStyle}>Today %</th><th style={thStyle}>30 Day %</th><th style={thStyle}>Action</th>
                    </tr>
                </thead>
                <tbody>
                    {market.length === 0 ? (<tr><td colSpan="7" style={{ padding: '20px', textAlign: 'center' }}>Loading Market Data...</td></tr>) : (market.map(stock => (
                        <tr key={stock.stock_id} style={{ borderBottom: '1px solid #eee' }}>
                            <td style={{...tdStyle, fontWeight: 'bold', color: '#007bff'}}>{stock.ticker}</td>
                            <td style={{...tdStyle, maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{stock.company_name}</td>
                            <td style={tdStyle}><span style={{background:'#eaf5ff', color:'#0366d6', padding:'2px 6px', borderRadius:'10px', fontSize:'11px'}}>{stock.sector}</span></td>
                            <td style={{...tdStyle, fontWeight:'bold'}}>{formatMoney(stock.current_price)}</td>
                            <td style={tdStyle}><ChangeIndicator val={stock.today_pct} isPercent /></td>
                            <td style={tdStyle}><ChangeIndicator val={stock.rolling_pct} isPercent /></td>
                            <td style={tdStyle}><button onClick={() => openBuyModal(stock)} style={btnSmall}>Buy</button></td>
                        </tr>
                    )))}
                </tbody>
            </table>
          </div>
        </div>

        {/* UNIFIED TRADING MODAL (Supports Buy & Sell) */}
        {selectedStock && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                <div style={{ background: 'white', padding: '30px', borderRadius: '12px', width: '400px', boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}>
                    
                    <h2 style={{marginTop:0, color: modalMode === 'BUY' ? '#28a745' : '#dc3545'}}>
                        {modalMode === 'BUY' ? 'Buy' : 'Sell'} {selectedStock.ticker}
                    </h2>

                    <div style={{padding:'15px', background:'#f8f9fa', borderRadius:'8px', marginBottom:'20px'}}>
                         <div style={{display:'flex', justifyContent:'space-between', marginBottom:'10px'}}><span>Current Price:</span><strong>{formatMoney(selectedStock.current_price)}</strong></div>
                         
                         {/* QUANTITY INPUT WITH MAX SELL BUTTON */}
                         <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:'10px'}}>
                             <span>Quantity:</span>
                             <div style={{display:'flex', gap:'5px'}}>
                                <input type="number" min="1" value={quantity} onChange={e=>setQuantity(e.target.value)} style={{width:'80px', padding:'5px'}} />
                                {modalMode === 'SELL' && (
                                    <button onClick={setMaxSell} style={{fontSize:'10px', padding:'2px 5px', background:'#dc3545', color:'white', border:'none', borderRadius:'3px', cursor:'pointer'}}>MAX</button>
                                )}
                             </div>
                         </div>

                         <div style={{borderTop:'1px solid #ddd', marginTop:'15px', paddingTop:'15px', display:'flex', justifyContent:'space-between', fontWeight:'bold'}}>
                             <span>Total Value:</span>
                             <span style={{color: canTrade ? '#333' : '#dc3545', fontWeight:'bold'}}>
                                 {formatMoney(tradeValue)}
                             </span>
                         </div>
                         {!canTrade && <div style={{fontSize:'12px', color:'#dc3545', marginTop:'5px', textAlign:'right'}}>{errorReason}</div>}
                    </div>

                    {tradeMsg && <div style={{marginBottom:'15px', color: tradeMsg.includes('Success')?'green':'red', textAlign:'center'}}>{tradeMsg}</div>}
                    
                    <div style={{display:'flex', gap:'10px'}}>
                        <button onClick={handleTrade} disabled={!canTrade} style={{...btnBig, background: !canTrade ? '#ccc' : (modalMode === 'BUY' ? '#28a745' : '#dc3545'), cursor: canTrade ? 'pointer' : 'not-allowed'}}>
                            Confirm {modalMode}
                        </button>
                        <button onClick={()=>{setSelectedStock(null); setTradeMsg('')}} style={{...btnBig, background:'#6c757d'}}>Cancel</button>
                    </div>
                </div>
            </div>
        )}

        {/* WALLET MODAL */}
        {showWallet && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                <div style={{ background: 'white', padding: '30px', borderRadius: '12px', width: '400px', boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}>
                    <h2 style={{marginTop:0, display:'flex', alignItems:'center', gap:'10px'}}>💰 Add Funds</h2>
                    <div style={{padding:'15px', background:'#f8f9fa', borderRadius:'8px', marginBottom:'20px'}}>
                         <div style={{display:'flex', justifyContent:'space-between', marginBottom:'10px'}}><span>Current Balance:</span><strong>{formatMoney(portfolio.cash)}</strong></div>
                         <div style={{marginBottom:'10px'}}>
                             <label style={{display:'block', marginBottom:'5px', fontSize:'13px', fontWeight:'bold'}}>Amount to Add ($)</label>
                             <input type="number" max="100000" value={walletAmount} onChange={e=>setWalletAmount(e.target.value)} placeholder="e.g. 5000" style={{width:'100%', padding:'10px', boxSizing:'border-box', border:'1px solid #ccc', borderRadius:'4px'}} />
                             <div style={{fontSize:'11px', color:'#666', marginTop:'5px'}}>Max transaction: $100,000. Total Limit: $1M.</div>
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

  // LOGIN SCREEN
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5', fontFamily: 'sans-serif' }}>
        <div style={{ background: 'white', padding: '40px', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', width: '350px' }}>
            <div style={{ textAlign: 'center', marginBottom: '30px' }}>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: '32px', fontWeight: '900', letterSpacing: '1px', marginBottom:'5px' }}><span style={{ color: '#d32f2f' }}>C</span><span style={{ color: '#1565c0' }}>D</span><span style={{ color: '#2e7d32' }}>M</span></div>
                <div style={{ fontSize: '14px', fontWeight: '800', color: '#2c3e50', textTransform:'uppercase', letterSpacing:'2px' }}>ProTrader</div>
            </div>
            {error && <div style={{padding:'10px', background:'#ffeeba', color:'#856404', borderRadius:'4px', marginBottom:'15px'}}>{error}</div>}
            <form onSubmit={handleAuth}>
                <input style={inputStyle} type="text" placeholder="Username" value={username} onChange={e=>setUsername(e.target.value)} />
                {!isLogin && <input style={inputStyle} type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />}
                <input style={inputStyle} type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} />
                <button type="submit" style={btnBig} disabled={loading}>{loading ? '...' : (isLogin ? 'Log In' : 'Create Account')}</button>
            </form>
            <p style={{textAlign:'center', marginTop:'15px', fontSize:'14px', color:'#666', cursor:'pointer'}} onClick={()=>setIsLogin(!isLogin)}>{isLogin ? "Need an account? Sign Up" : "Have an account? Log In"}</p>
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
const inputStyle = { width: '100%', padding: '10px', marginBottom: '15px', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box' };

export default App;import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import AdminDashboard from './AdminDashboard'; 

const API_BASE = 'https://stock-trading-api-fcp5.onrender.com';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(null);
  const [view, setView] = useState('dashboard');
  
  // DATA STATES
  const [portfolio, setPortfolio] = useState({ cash: 0, stockValue: 0, totalValue: 0, dayChange: 0, dayChangePct: 0, recentActivity: null }); 
  const [holdings, setHoldings] = useState([]);     
  const [market, setMarket] = useState([]);         
  const [chartData, setChartData] = useState([]);   

  // UI STATES
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(false); 

  // MODALS
  const [selectedStock, setSelectedStock] = useState(null); // Buy Modal
  const [showWallet, setShowWallet] = useState(false);      // Wallet Modal
  const [walletAmount, setWalletAmount] = useState('');     // Wallet Input
  const [quantity, setQuantity] = useState(1);
  const [tradeMsg, setTradeMsg] = useState('');
  const [walletMsg, setWalletMsg] = useState('');

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
          handleLogout();
          alert("⛔ Access Denied: You are not an Admin.");
      }
  };

  const handleLoginAs = (targetUser) => {
    setUser(targetUser); 
    loadDashboard(targetUser.user_id);
    setView('dashboard'); 
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const endpoint = isLogin ? `${API_BASE}/api/auth/login` : `${API_BASE}/api/auth/register`;
    const payload = isLogin ? { username, password } : { username, email, password };

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (isLogin) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        setToken(data.token);
        setUser(data.user);
        loadDashboard(data.user.id);
      } else {
        setIsLogin(true);
        setError('Success! Please log in.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBuy = async () => {
    setTradeMsg('Processing...');
    if(!user || !selectedStock) return;

    try {
      const res = await fetch(`${API_BASE}/api/orders/buy`, {
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
        setTradeMsg('✅ Trade Executed!');
        setTimeout(() => {
            setSelectedStock(null);
            setTradeMsg('');
            loadDashboard(user.id || user.user_id); 
        }, 1500);
      } else {
        setTradeMsg(`❌ Error: ${data.error}`);
      }
    } catch (err) {
      setTradeMsg(`❌ Error: ${err.message}`);
    }
  };

  // --- NEW: WALLET HANDLER ---
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
                  loadDashboard(user.id || user.user_id); // Refresh Data
              }, 1500);
          } else {
              setWalletMsg(`❌ ${data.error}`);
          }
      } catch (err) {
          setWalletMsg(`❌ Error: ${err.message}`);
      }
  };

  const formatMoney = (num) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num || 0);
  
  const ChangeIndicator = ({ val, isPercent }) => {
     if(!val || val === 0) return <span style={{color:'#999', fontSize:'12px'}}>-</span >;
     const color = val > 0 ? '#28a745' : '#dc3545';
     const sign = val > 0 ? '+' : '';
     return <span style={{color, fontWeight:'bold'}}>{sign}{isPercent ? Number(val).toFixed(2) + '%' : formatMoney(val)}</span>;
  };

  const LoadingSpinner = () => (
      <div style={{ marginLeft: '40px', marginTop: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div className="spinner"></div> 
          <span style={{ fontSize: '13px', color: '#666', fontWeight: 'bold' }}>UPDATING LIVE DATA...</span>
          <style>{`
            .spinner { width: 20px; height: 20px; border: 3px solid #f3f3f3; border-top: 3px solid #3498db; border-radius: 50%; animation: spin 1s linear infinite; }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          `}</style>
      </div>
  );

  if (token && view === 'admin') {
      return <AdminDashboard onBack={() => setView('dashboard')} onLoginAs={handleLoginAs} />;
  }

  if (token) {
    const isAdmin = user?.is_admin;
    // Calculate Buying Power for Validation
    const tradeCost = selectedStock ? selectedStock.current_price * quantity : 0;
    const canAfford = tradeCost <= portfolio.cash;

    return (
      <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', background: '#f4f6f9', minHeight: '100vh', paddingBottom: '50px' }}>
        
        {/* HEADER */}
        <div style={{ background: '#fff', padding: '15px 40px', borderBottom: '1px solid #e1e4e8', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: '32px', fontWeight: '900', letterSpacing: '1px' }}><span style={{ color: '#d32f2f' }}>C</span><span style={{ color: '#1565c0' }}>D</span><span style={{ color: '#2e7d32' }}>M</span></div>
            <div style={{ display:'flex', flexDirection:'column', justifyContent:'center' }}><span style={{ fontSize: '20px', fontWeight: '800', color: '#2c3e50', lineHeight:'1', letterSpacing:'-0.5px' }}>ProTrader</span><span style={{ fontSize: '11px', fontWeight: '400', color: '#95a5a6', textTransform:'uppercase', letterSpacing:'2px' }}>Dashboard</span></div>
          </div>
          <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
            
            {/* WALLET BUTTON */}
            <button onClick={() => setShowWallet(true)} style={{ padding: '8px 16px', fontSize: '13px', background: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px' }}>💰 Wallet</button>

            <button onClick={handleAdminClick} style={{ padding: '8px 16px', fontSize: '13px', background: isAdmin ? '#343a40' : '#e9ecef', color: isAdmin ? '#fff' : '#adb5bd', border: 'none', borderRadius: '4px', cursor: isAdmin ? 'pointer' : 'not-allowed', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px' }}>{isAdmin ? '🔒 Admin' : '🔒 Restricted'}</button>
            <div style={{borderLeft:'1px solid #ddd', height:'25px'}}></div>
            <span style={{ fontSize: '14px', fontWeight: '600', color: '#555' }}>{user?.username}</span>
            <button onClick={handleLogout} style={{ padding: '6px 12px', fontSize: '13px', background: 'none', border: '1px solid #d1d5da', borderRadius: '4px', cursor: 'pointer', color:'#666' }}>Logout</button>
          </div>
        </div>

        {dataLoading && <LoadingSpinner />}

        <div style={{ maxWidth: '1400px', margin: '30px auto', padding: '0 20px' }}>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '30px' }}>
            <MetricCard title="Cash Available" value={formatMoney(portfolio.cash)} sub="Buying Power" />
            <MetricCard title="Net Account Value" value={formatMoney(portfolio.totalValue)} sub="Cash + Holdings" highlight />
            <div style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                <div style={{ fontSize: '12px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Day's Change</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold', marginTop: '5px' }}><ChangeIndicator val={portfolio.dayChange} /></div>
                <div style={{ fontSize: '13px', marginTop: '2px' }}><ChangeIndicator val={portfolio.dayChangePct} isPercent /></div>
            </div>
            <div style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: '4px solid #007bff' }}>
                <div style={{ fontSize: '12px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Recent Activity</div>
                <div style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '5px' }}>{portfolio.recentActivity ? `Bought ${portfolio.recentActivity.quantity} ${portfolio.recentActivity.ticker}` : 'No trades yet'}</div>
                <div style={{ fontSize: '13px', color: '#666', marginTop: '2px' }}>{portfolio.recentActivity ? `@ ${formatMoney(portfolio.recentActivity.price_executed)}` : 'Start trading now'}</div>
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

          <div style={{ background: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
            <div style={{ padding: '15px 25px', borderBottom: '1px solid #eee' }}><h3 style={{ margin: 0 }}>Positions</h3></div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead style={{ background: '#f8f9fa', borderBottom: '2px solid #e1e4e8' }}>
                    <tr>
                        <th style={thStyle}>Symbol</th><th style={thStyle}>Last Price</th><th style={thStyle}>Day Change</th><th style={thStyle}>Total Gain/Loss</th><th style={thStyle}>Current Value</th><th style={thStyle}>Quantity</th><th style={thStyle}>Avg Cost</th><th style={thStyle}>Total Cost</th><th style={thStyle}>Action</th>
                    </tr>
                </thead>
                <tbody>
                    {holdings.length === 0 ? (<tr><td colSpan="9" style={{ padding: '30px', textAlign: 'center', color: '#999' }}>No positions held. Check the Market below!</td></tr>) : (holdings.map(stock => (
                        <tr key={stock.stock_id} style={{ borderBottom: '1px solid #eee' }}>
                            <td style={{...tdStyle, fontWeight: 'bold', color: '#007bff'}}>{stock.ticker}</td>
                            <td style={tdStyle}>{formatMoney(stock.current_price)}</td>
                            <td style={tdStyle}><ChangeIndicator val={stock.day_change} isPercent /></td>
                            <td style={tdStyle}><ChangeIndicator val={stock.total_gain} /><br/><span style={{fontSize:'11px'}}><ChangeIndicator val={stock.total_gain_pct} isPercent /></span></td>
                            <td style={{...tdStyle, fontWeight:'bold'}}>{formatMoney(stock.market_value)}</td>
                            <td style={tdStyle}>{stock.quantity}</td>
                            <td style={tdStyle}>{formatMoney(stock.avg_cost)}</td>
                            <td style={tdStyle}>{formatMoney(stock.total_cost)}</td> 
                            <td style={tdStyle}><button onClick={() => setSelectedStock(stock)} style={btnSmall}>Buy More</button></td>
                        </tr>
                    )))}
                </tbody>
            </table>
          </div>

          <br /> <br />

          <div style={{ background: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
            <div style={{ padding: '15px 25px', borderBottom: '1px solid #eee' }}><h3 style={{ margin: 0 }}>Market Data</h3></div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead style={{ background: '#f8f9fa', borderBottom: '2px solid #e1e4e8' }}>
                    <tr>
                        <th style={thStyle}>Symbol</th><th style={{...thStyle, width: '200px'}}>Company</th><th style={thStyle}>Sector</th><th style={thStyle}>Price</th><th style={thStyle}>Today %</th><th style={thStyle}>30 Day %</th><th style={thStyle}>Action</th>
                    </tr>
                </thead>
                <tbody>
                    {market.length === 0 ? (<tr><td colSpan="7" style={{ padding: '20px', textAlign: 'center' }}>Loading Market Data...</td></tr>) : (market.map(stock => (
                        <tr key={stock.stock_id} style={{ borderBottom: '1px solid #eee' }}>
                            <td style={{...tdStyle, fontWeight: 'bold', color: '#007bff'}}>{stock.ticker}</td>
                            <td style={{...tdStyle, maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{stock.company_name}</td>
                            <td style={tdStyle}><span style={{background:'#eaf5ff', color:'#0366d6', padding:'2px 6px', borderRadius:'10px', fontSize:'11px'}}>{stock.sector}</span></td>
                            <td style={{...tdStyle, fontWeight:'bold'}}>{formatMoney(stock.current_price)}</td>
                            <td style={tdStyle}><ChangeIndicator val={stock.today_pct} isPercent /></td>
                            <td style={tdStyle}><ChangeIndicator val={stock.rolling_pct} isPercent /></td>
                            <td style={tdStyle}><button onClick={() => setSelectedStock(stock)} style={btnSmall}>Buy</button></td>
                        </tr>
                    )))}
                </tbody>
            </table>
          </div>
        </div>

        {/* BUY MODAL */}
        {selectedStock && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                <div style={{ background: 'white', padding: '30px', borderRadius: '12px', width: '400px', boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}>
                    <h2 style={{marginTop:0}}>Buy {selectedStock.ticker}</h2>
                    <div style={{padding:'15px', background:'#f8f9fa', borderRadius:'8px', marginBottom:'20px'}}>
                         <div style={{display:'flex', justifyContent:'space-between', marginBottom:'10px'}}><span>Current Price:</span><strong>{formatMoney(selectedStock.current_price)}</strong></div>
                         <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}><span>Quantity:</span><input type="number" min="1" value={quantity} onChange={e=>setQuantity(e.target.value)} style={{width:'80px', padding:'5px'}} /></div>
                         <div style={{borderTop:'1px solid #ddd', marginTop:'15px', paddingTop:'15px', display:'flex', justifyContent:'space-between', fontWeight:'bold'}}>
                             <span>Total Cost:</span>
                             {/* Buying Power Check Logic */}
                             <span style={{color: canAfford ? '#333' : '#dc3545', fontWeight:'bold'}}>
                                 {formatMoney(tradeCost)}
                             </span>
                         </div>
                         {!canAfford && <div style={{fontSize:'12px', color:'#dc3545', marginTop:'5px', textAlign:'right'}}>Insufficient Funds! (Available: {formatMoney(portfolio.cash)})</div>}
                    </div>
                    {tradeMsg && <div style={{marginBottom:'15px', color: tradeMsg.includes('Success')?'green':'red', textAlign:'center'}}>{tradeMsg}</div>}
                    <div style={{display:'flex', gap:'10px'}}>
                        <button onClick={handleBuy} disabled={!canAfford} style={{...btnBig, background: canAfford ? '#28a745' : '#ccc', cursor: canAfford ? 'pointer' : 'not-allowed'}}>Confirm Order</button>
                        <button onClick={()=>{setSelectedStock(null); setTradeMsg('')}} style={{...btnBig, background:'#6c757d'}}>Cancel</button>
                    </div>
                </div>
            </div>
        )}

        {/* NEW: WALLET MODAL */}
        {showWallet && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                <div style={{ background: 'white', padding: '30px', borderRadius: '12px', width: '400px', boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}>
                    <h2 style={{marginTop:0, display:'flex', alignItems:'center', gap:'10px'}}>💰 Add Funds</h2>
                    <div style={{padding:'15px', background:'#f8f9fa', borderRadius:'8px', marginBottom:'20px'}}>
                         <div style={{display:'flex', justifyContent:'space-between', marginBottom:'10px'}}><span>Current Balance:</span><strong>{formatMoney(portfolio.cash)}</strong></div>
                         <div style={{marginBottom:'10px'}}>
                             <label style={{display:'block', marginBottom:'5px', fontSize:'13px', fontWeight:'bold'}}>Amount to Add ($)</label>
                             <input type="number" max="100000" value={walletAmount} onChange={e=>setWalletAmount(e.target.value)} placeholder="e.g. 5000" style={{width:'100%', padding:'10px', boxSizing:'border-box', border:'1px solid #ccc', borderRadius:'4px'}} />
                             <div style={{fontSize:'11px', color:'#666', marginTop:'5px'}}>Max transaction: $100,000. Total Limit: $1M.</div>
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

  // LOGIN SCREEN
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5', fontFamily: 'sans-serif' }}>
        <div style={{ background: 'white', padding: '40px', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', width: '350px' }}>
            <div style={{ textAlign: 'center', marginBottom: '30px' }}>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: '32px', fontWeight: '900', letterSpacing: '1px', marginBottom:'5px' }}><span style={{ color: '#d32f2f' }}>C</span><span style={{ color: '#1565c0' }}>D</span><span style={{ color: '#2e7d32' }}>M</span></div>
                <div style={{ fontSize: '14px', fontWeight: '800', color: '#2c3e50', textTransform:'uppercase', letterSpacing:'2px' }}>ProTrader</div>
            </div>
            {error && <div style={{padding:'10px', background:'#ffeeba', color:'#856404', borderRadius:'4px', marginBottom:'15px'}}>{error}</div>}
            <form onSubmit={handleAuth}>
                <input style={inputStyle} type="text" placeholder="Username" value={username} onChange={e=>setUsername(e.target.value)} />
                {!isLogin && <input style={inputStyle} type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />}
                <input style={inputStyle} type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} />
                <button type="submit" style={btnBig} disabled={loading}>{loading ? '...' : (isLogin ? 'Log In' : 'Create Account')}</button>
            </form>
            <p style={{textAlign:'center', marginTop:'15px', fontSize:'14px', color:'#666', cursor:'pointer'}} onClick={()=>setIsLogin(!isLogin)}>{isLogin ? "Need an account? Sign Up" : "Have an account? Log In"}</p>
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
const inputStyle = { width: '100%', padding: '10px', marginBottom: '15px', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box' };

export default App;
