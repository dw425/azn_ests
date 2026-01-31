import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

// POINT TO YOUR BACKEND
const API_BASE = 'https://stock-trading-api-fcp5.onrender.com';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(null);
  
  // DATA STATES (Start at 0)
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

  // TRADING MODAL
  const [selectedStock, setSelectedStock] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [tradeMsg, setTradeMsg] = useState('');

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
        const portRes = await fetch(`${API_BASE}/api/portfolio/summary/${userId}`);
        const portData = await portRes.json();
        if (!portData.error) setPortfolio(portData);

        const holdRes = await fetch(`${API_BASE}/api/portfolio/holdings/${userId}`);
        const holdData = await holdRes.json();
        setHoldings(Array.isArray(holdData) ? holdData : []);

        const chartRes = await fetch(`${API_BASE}/api/portfolio/chart/${userId}`);
        const chartData = await chartRes.json();
        setChartData(Array.isArray(chartData) ? chartData : []);

        const marketRes = await fetch(`${API_BASE}/api/stocks`);
        const marketData = await marketRes.json();
        setMarket(Array.isArray(marketData) ? marketData : []);

    } catch (err) {
        console.error("Dashboard Load Error:", err);
    } finally {
        setDataLoading(false);
    }
  };

  // --- HANDLERS ---
  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
    setPortfolio({ cash: 0, stockValue: 0, totalValue: 0, dayChange: 0, dayChangePct: 0, recentActivity: null });
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

  // --- RENDER HELPERS ---
  const formatMoney = (num) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num || 0);
  
  const ChangeIndicator = ({ val, isPercent }) => {
     if(!val || val === 0) return <span style={{color:'#666'}}>-</span >;
     const color = val > 0 ? '#28a745' : '#dc3545';
     const sign = val > 0 ? '+' : '';
     return <span style={{color, fontWeight:'bold'}}>{sign}{isPercent ? val.toFixed(2) + '%' : formatMoney(val)}</span>;
  };

  // --- MAIN VIEW ---
  if (token) {
    return (
      <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', background: '#f4f6f9', minHeight: '100vh', paddingBottom: '50px' }}>
        
        {/* NAV */}
        <div style={{ background: '#fff', padding: '15px 40px', borderBottom: '1px solid #e1e4e8', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ fontFamily: 'Georgia, serif', fontSize: '32px', fontWeight: '900', color: '#d32f2f', marginRight: '1px' }}>C</span>
            <span style={{ fontFamily: 'Georgia, serif', fontSize: '32px', fontWeight: '900', color: '#1565c0', marginRight: '1px' }}>D</span>
            <span style={{ fontFamily: 'Georgia, serif', fontSize: '32px', fontWeight: '900', color: '#2e7d32', marginRight: '10px' }}>M</span>
            <h2 style={{ margin: 0, color: '#333', fontSize: '24px', fontWeight: '600' }}>ProTrader Dashboard</h2>
          </div>
          <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
            <span style={{ fontSize: '14px', fontWeight: '600', color: '#555' }}>{user?.username}</span>
            <button onClick={handleLogout} style={{ padding: '6px 12px', fontSize: '13px', background: 'none', border: '1px solid #d1d5da', borderRadius: '4px', cursor: 'pointer' }}>Logout</button>
          </div>
        </div>

        {dataLoading && <div style={{ background: '#e2e6ea', color: '#555', padding: '10px', textAlign: 'center', fontSize: '12px' }}>🔄 Refreshing Data...</div>}

        <div style={{ maxWidth: '1400px', margin: '30px auto', padding: '0 20px' }}>
          
          {/* TOP METRICS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '30px' }}>
            <MetricCard title="Cash Available" value={formatMoney(portfolio.cash)} sub="Buying Power" />
            <MetricCard title="Net Account Value" value={formatMoney(portfolio.totalValue)} sub="Cash + Holdings" highlight />
            
            <div style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                <div style={{ fontSize: '12px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Day's Change</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold', marginTop: '5px' }}>
                    <ChangeIndicator val={portfolio.dayChange} />
                </div>
                <div style={{ fontSize: '13px', marginTop: '2px' }}>
                    <ChangeIndicator val={portfolio.dayChangePct} isPercent />
                </div>
            </div>
            
            <div style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: '4px solid #007bff' }}>
                <div style={{ fontSize: '12px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Recent Activity</div>
                <div style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '5px' }}>
                    {portfolio.recentActivity ? `Bought ${portfolio.recentActivity.quantity} ${portfolio.recentActivity.ticker}` : 'No trades yet'}
                </div>
                <div style={{ fontSize: '13px', color: '#666', marginTop: '2px' }}>
                     {portfolio.recentActivity ? `@ ${formatMoney(portfolio.recentActivity.price_executed)}` : 'Start trading now'}
                </div>
            </div>
          </div>

          {/* CHART */}
          <div style={{ background: 'white', padding: '25px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: '30px' }}>
            <h3 style={{ marginTop: 0, marginBottom: '20px', fontSize: '18px', color: '#333' }}>Portfolio Performance (30 Day)</h3>
            <div style={{ height: '300px', width: '100%' }}>
                <ResponsiveContainer>
                    <AreaChart data={chartData}>
                        <defs>
                            <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#007bff" stopOpacity={0.1}/>
                                <stop offset="95%" stopColor="#007bff" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                        <XAxis dataKey="day" hide />
                        <YAxis domain={['auto', 'auto']} tickFormatter={(val) => `$${val/1000}k`} stroke="#999" fontSize={12} />
                        <Tooltip formatter={(val) => formatMoney(val)} />
                        <Area type="monotone" dataKey="value" stroke="#007bff" strokeWidth={2} fillOpacity={1} fill="url(#colorVal)" />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
          </div>

          {/* HOLDINGS TABLE */}
          <div style={{ background: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
            <div style={{ padding: '15px 25px', borderBottom: '1px solid #eee' }}>
                <h3 style={{ margin: 0 }}>Positions</h3>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead style={{ background: '#f8f9fa', borderBottom: '2px solid #e1e4e8' }}>
                    <tr>
                        <th style={thStyle}>Symbol</th>
                        <th style={thStyle}>Last Price</th>
                        <th style={thStyle}>Day Change</th>
                        <th style={thStyle}>Total Gain/Loss</th>
                        <th style={thStyle}>Current Value</th>
                        <th style={thStyle}>Quantity</th>
                        <th style={thStyle}>Avg Cost</th>
                        <th style={thStyle}>Total Cost</th> 
                        <th style={thStyle}>Action</th>
                    </tr>
                </thead>
                <tbody>
                    {holdings.length === 0 ? (
                        <tr><td colSpan="9" style={{ padding: '30px', textAlign: 'center', color: '#999' }}>No positions held. Check the Market below!</td></tr>
                    ) : (
                        holdings.map(stock => (
                            <tr key={stock.stock_id} style={{ borderBottom: '1px solid #eee' }}>
                                <td style={{...tdStyle, fontWeight: 'bold', color: '#007bff'}}>{stock.ticker}</td>
                                <td style={tdStyle}>{formatMoney(stock.current_price)}</td>
                                <td style={tdStyle}><ChangeIndicator val={stock.day_change} /></td>
                                <td style={tdStyle}><ChangeIndicator val={stock.total_gain} /><br/><span style={{fontSize:'11px'}}><ChangeIndicator val={stock.total_gain_pct} isPercent /></span></td>
                                <td style={{...tdStyle, fontWeight:'bold'}}>{formatMoney(stock.market_value)}</td>
                                <td style={tdStyle}>{stock.quantity}</td>
                                <td style={tdStyle}>{formatMoney(stock.avg_cost)}</td>
                                <td style={tdStyle}>{formatMoney(stock.total_cost)}</td> 
                                <td style={tdStyle}><button onClick={() => setSelectedStock(stock)} style={btnSmall}>Buy More</button></td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
          </div>

          <br /> <br />

          {/* MARKET TABLE */}
          <div style={{ background: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
            <div style={{ padding: '15px 25px', borderBottom: '1px solid #eee' }}>
                <h3 style={{ margin: 0 }}>Market Data</h3>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead style={{ background: '#f8f9fa', borderBottom: '2px solid #e1e4e8' }}>
                    <tr>
                        <th style={thStyle}>Symbol</th>
                        <th style={{...thStyle, width: '200px'}}>Company</th> 
                        <th style={thStyle}>Sector</th>
                        <th style={thStyle}>Price</th>
                        <th style={thStyle}>Today %</th>
                        <th style={thStyle}>MTD %</th>
                        <th style={thStyle}>Action</th>
                    </tr>
                </thead>
                <tbody>
                    {market.length === 0 ? (
                        <tr><td colSpan="7" style={{ padding: '20px', textAlign: 'center' }}>Loading Market Data...</td></tr>
                    ) : (
                        market.map(stock => (
                            <tr key={stock.stock_id} style={{ borderBottom: '1px solid #eee' }}>
                                <td style={{...tdStyle, fontWeight: 'bold', color: '#007bff'}}>{stock.ticker}</td>
                                <td style={{...tdStyle, maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{stock.company_name}</td>
                                <td style={tdStyle}><span style={{background:'#eaf5ff', color:'#0366d6', padding:'2px 6px', borderRadius:'10px', fontSize:'11px'}}>{stock.sector}</span></td>
                                <td style={{...tdStyle, fontWeight:'bold'}}>{formatMoney(stock.current_price)}</td>
                                <td style={tdStyle}><ChangeIndicator val={(Math.random() * 4) - 2} isPercent /></td>
                                <td style={tdStyle}><ChangeIndicator val={(Math.random() * 10) - 5} isPercent /></td>
                                <td style={tdStyle}><button onClick={() => setSelectedStock(stock)} style={btnSmall}>Buy</button></td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
          </div>
        </div>

        {/* TRADE MODAL */}
        {selectedStock && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                <div style={{ background: 'white', padding: '30px', borderRadius: '12px', width: '400px', boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}>
                    <h2 style={{marginTop:0}}>Buy {selectedStock.ticker}</h2>
                    <div style={{padding:'15px', background:'#f8f9fa', borderRadius:'8px', marginBottom:'20px'}}>
                         <div style={{display:'flex', justifyContent:'space-between', marginBottom:'10px'}}>
                            <span>Current Price:</span>
                            <strong>{formatMoney(selectedStock.current_price)}</strong>
                         </div>
                         <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                            <span>Quantity:</span>
                            <input type="number" min="1" value={quantity} onChange={e=>setQuantity(e.target.value)} style={{width:'80px', padding:'5px'}} />
                         </div>
                         <div style={{borderTop:'1px solid #ddd', marginTop:'15px', paddingTop:'15px', display:'flex', justifyContent:'space-between', fontWeight:'bold'}}>
                            <span>Total Cost:</span>
                            <span style={{color:'#dc3545'}}>{formatMoney(selectedStock.current_price * quantity)}</span>
                         </div>
                    </div>
                    {tradeMsg && <div style={{marginBottom:'15px', color: tradeMsg.includes('Success')?'green':'red', textAlign:'center'}}>{tradeMsg}</div>}
                    <div style={{display:'flex', gap:'10px'}}>
                        <button onClick={handleBuy} style={{...btnBig, background:'#28a745'}}>Confirm Order</button>
                        <button onClick={()=>{setSelectedStock(null); setTradeMsg('')}} style={{...btnBig, background:'#6c757d'}}>Cancel</button>
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
            <h2 style={{textAlign:'center', marginBottom:'20px', color:'#333'}}>Market<span style={{color:'#007bff'}}>Sim</span></h2>
            {error && <div style={{padding:'10px', background:'#ffeeba', color:'#856404', borderRadius:'4px', marginBottom:'15px'}}>{error}</div>}
            <form onSubmit={handleAuth}>
                <input style={inputStyle} type="text" placeholder="Username" value={username} onChange={e=>setUsername(e.target.value)} />
                {!isLogin && <input style={inputStyle} type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />}
                <input style={inputStyle} type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} />
                <button type="submit" style={btnBig} disabled={loading}>{loading ? '...' : (isLogin ? 'Log In' : 'Create Account')}</button>
            </form>
            <p style={{textAlign:'center', marginTop:'15px', fontSize:'14px', color:'#666', cursor:'pointer'}} onClick={()=>setIsLogin(!isLogin)}>
                {isLogin ? "Need an account? Sign Up" : "Have an account? Log In"}
            </p>
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
