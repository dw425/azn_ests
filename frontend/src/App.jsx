import React, { useState, useEffect } from 'react';

function App() {
  const [message, setMessage] = useState("Connecting to backend...");

  // Simple test to see if frontend can talk to backend
  useEffect(() => {
    fetch('https://stock-trading-api-fcp5.onrender.com/')
      .then(res => res.text())
      .then(data => setMessage("✅ Backend says: " + data))
      .catch(err => setMessage("❌ Error: " + err.message));
  }, []);

  return (
    <div style={{ padding: '50px', textAlign: 'center' }}>
      <h1>🚀 Stock Trading System</h1>
      <div style={{ 
        padding: '20px', 
        backgroundColor: 'white', 
        borderRadius: '10px', 
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
        display: 'inline-block'
      }}>
        <h2>System Status:</h2>
        <p style={{ fontSize: '18px', fontWeight: 'bold', color: message.includes('✅') ? 'green' : 'red' }}>
          {message}
        </p>
      </div>
    </div>
  );
}

export default App;
