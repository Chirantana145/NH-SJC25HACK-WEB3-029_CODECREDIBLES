import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import './App.css'; 

// Register Chart.js components
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const socket = io('http://localhost:3001');
const API_BASE_URL = '/api'; // Use proxy in vite.config.js

const AttackStatsChart = ({ chartData }) => {
  if (!chartData) return <p>Loading attack statistics...</p>;

  const data = {
    labels: chartData.data.labels,
    datasets: Object.entries(chartData.data.types).map(([type, counts], index) => ({
      label: type,
      data: counts,
      backgroundColor: `hsl(${index * 90}, 70%, 50%)`, // Different color for each type
      stack: 'Stack 1',
    })),
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false, // Allows the chart to fill the container size
    scales: {
      x: { stacked: true, title: { display: true, text: 'Year' } },
      y: { stacked: true, title: { display: true, text: 'Attacks (Thousands)' } },
    },
    plugins: {
      title: { display: true, text: chartData.title },
      tooltip: {
        callbacks: {
          title: (context) => {
             const yearIndex = context[0].dataIndex;
             // Find all types in this year
             const types = context.map(item => `${item.dataset.label}: ${item.formattedValue}K`);
             return [
                 context[0].label,
                 ...types,
                 `Total Estimated Loss: ${chartData.data.totalLossUSD[yearIndex]}`
             ];
          },
          label: (context) => {
            // Return empty string here to let the custom title handle all info
            return '';
          }
        },
        mode: 'index',
        intersect: false,
      },
      legend: {
        position: 'bottom',
      }
    },
  };

  return (
    <div className="card full-width chart-card">
        <h2>Attack Statistics (MEV Loss)</h2>
        <p className="card-subtitle">Showing estimated number of attacks by type and total estimated loss per year (Source: Simulated Data/Research Aggregation).</p>
        <div style={{ flexGrow: 1 }}>
            <Bar data={data} options={options} />
        </div>
    </div>
  );
};


function App() {
    const [status, setStatus] = useState('Connecting...');
    const [liveAttacks, setLiveAttacks] = useState([]);
    const [tradeInput, setTradeInput] = useState('');
    const [simulationResult, setSimulationResult] = useState(null);
    const [rawTx, setRawTx] = useState('');
    const [walletHealth, setWalletHealth] = useState(null);
    const [attackStats, setAttackStats] = useState(null);
    const attackRef = useRef(null);
    
    // Hardcoded mock address for simplicity
    const MOCK_WALLET_ADDRESS = '0xMockWalletAddress'; 

    // --- Socket.io & API Side Effects ---
    useEffect(() => {
        // Socket.io connection handling
        socket.on('connect', () => setStatus('Connected to server.'));
        socket.on('disconnect', () => setStatus('Disconnected. Attempting reconnect...'));
        socket.on('STATUS', (msg) => setStatus(msg.message));
        
        socket.on('new_attack', (attack) => {
            setLiveAttacks(prev => {
                const newAttacks = [attack, ...prev];
                return newAttacks.slice(0, 10); 
            });
             // Add pulse animation to card
             attackRef.current.classList.add('new-attack-pulse');
             setTimeout(() => attackRef.current.classList.remove('new-attack-pulse'), 500);
        });

        // Fetch initial data
        fetchWalletHealth(MOCK_WALLET_ADDRESS);
        fetchAttackStats();

        return () => {
            socket.off('connect');
            socket.off('disconnect');
            socket.off('STATUS');
            socket.off('new_attack');
        };
    }, []);

    const fetchWalletHealth = async (address) => {
        try {
            const res = await fetch(`${API_BASE_URL}/wallet-health/${address}`);
            const data = await res.json();
            if (data.success) {
                setWalletHealth(data);
            }
        } catch (error) {
            console.error('Error fetching wallet health:', error);
        }
    };
    
    const fetchAttackStats = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/attack-stats`);
            const data = await res.json();
            if (data.success) {
                setAttackStats(data.stats);
            }
        } catch (error) {
            console.error('Error fetching attack stats:', error);
        }
    };

    // --- Action Handlers ---

    const handleSimulation = async () => {
        if (!tradeInput) return;
        try {
            const res = await fetch(`${API_BASE_URL}/simulate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tradeDescription: tradeInput })
            });
            const data = await res.json();
            if (data.success) {
                setSimulationResult(data.simulation);
            }
        } catch (error) {
            console.error('Error running simulation:', error);
        }
    };
    
    const handleSubmitProtectedTrade = async () => {
        if (!rawTx) return;
        try {
            const res = await fetch(`${API_BASE_URL}/protect`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rawTransaction: rawTx })
            });
            const data = await res.json();
            if (data.success) {
                alert(`SUCCESS! ${data.message} Tx Hash: ${data.txHash}`);
                setRawTx(''); // Clear input after submission
            } else {
                 alert(`ERROR: ${data.message}`);
            }
        } catch (error) {
            console.error('Error submitting trade:', error);
            alert('An unexpected error occurred during submission.');
        }
    };
    
    const handleLearnMore = () => {
        // Redirects to a resource about Flashbots/Private Mempools
        window.open("https://docs.flashbots.net/flashbots-protect/overview", "_blank");
    };

    // --- Render UI ---
    return (
        <div className="dapp-container">
            <header className="header">
                <h1>MEV-Shield DApp | Real-Time Protection</h1>
                <div className="header-actions">
                    <button onClick={handleLearnMore} className="learn-more-btn">
                        Learn About MEV & Private Mempool
                    </button>
                    <button className="connect-wallet-btn">Connect Wallet 🔑</button>
                </div>
            </header>

            <div className="status-bar">
                <p><strong>Server Status:</strong> {status}</p>
            </div>

            <div className="main-grid">
                
                {/* 1. Transaction Simulator */}
                <div className="card">
                    <h2>Transaction Simulator</h2>
                    <input
                        type="text"
                        placeholder="e.g., Swap 1 ETH for DAI on Uniswap"
                        value={tradeInput}
                        onChange={(e) => setTradeInput(e.target.value)}
                    />
                    <button className="run-sim-btn" onClick={handleSimulation}>
                        Run MEV Risk Simulation
                    </button>
                    {simulationResult && (
                        <div className="simulation-results">
                            <h3>AI Simulation Results</h3>
                            <p><strong>Risk Score:</strong> <span className={simulationResult.risk === 'High' ? 'risk-high' : 'risk-low'}>{simulationResult.risk}/100</span></p>
                            <p><strong>Est. Value Impact:</strong> <span className={simulationResult.profitLoss.startsWith('+') ? 'profit' : 'loss'}>{simulationResult.profitLoss}</span></p>
                            <p className="attack-detail">**AI Rationale:** {simulationResult.details}</p>
                        </div>
                    )}
                </div>
                
                {/* 2. Live Attack Feed (Real-Time) - AI-ANALYZED */}
                <div className="card live-feed-card" ref={attackRef}>
                    <h2>Live Attack Feed (AI-Analyzed)</h2>
                    <p className="card-subtitle">Real-time MEV opportunities detected in the simulated mempool by the AI risk analyzer.</p>
                    <div className="attack-list">
                        {liveAttacks.length === 0 ? (
                            <p>Waiting for real-time attack data...</p>
                        ) : (
                            liveAttacks.map(attack => (
                                <div key={attack.id} className="attack-item">
                                    <strong><span className={attack.method.includes('Attack') ? 'risk-high' : 'risk-low'}>{attack.method}</span></strong> - Extracted: {attack.value}
                                    <p className="attack-detail">Tx: {attack.transaction} | Risk: {attack.riskScore}</p>
                                </div>
                            ))
                        )}
                    </div>
                </div>
                
                {/* 4. Submit Protected Trade (Flashbots Relay) */}
                <div className="card">
                    <h2>Submit Protected Trade (Private Mempool)</h2>
                    <p className="card-subtitle">Submits your transaction directly to a simulated Flashbots-style relay for MEV protection.</p>
                    <textarea
                        placeholder="Paste Signed Raw Transaction (Hex) for Private Submission"
                        value={rawTx}
                        onChange={(e) => setRawTx(e.target.value)}
                        rows="4"
                    />
                    <button className="submit-trade-btn" onClick={handleSubmitProtectedTrade}>
                        Submit to MEV Protection Relay
                    </button>
                </div>

                {/* 5. Wallet Health Check */}
                <div className="card">
                    <h2>Wallet Health Check</h2>
                    {walletHealth && (
                        <div className="wallet-details">
                            <p><strong>Wallet:</strong> {walletHealth.address.slice(0, 10)}...</p>
                            <p><strong>MEV Exposure Score:</strong> <span className="score">{walletHealth.mevExposureScore}/100</span></p>
                            <p><strong>Balance:</strong> {walletHealth.balance}</p>
                            <h3>Alerts ({walletHealth.alerts.length})</h3>
                            <ul>
                                {walletHealth.alerts.map((alert, index) => (
                                    <li key={index} className={alert.startsWith('Warning') ? 'alert-warning' : 'alert-info'}>{alert}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                    <button className="refresh-btn" onClick={() => fetchWalletHealth(MOCK_WALLET_ADDRESS)}>
                        Refresh Health
                    </button>
                </div>

                {/* 6. My Watchlist - Retained from screenshot */}
                <div className="card">
                    <h2>My Watchlist (Mock)</h2>
                    <p className="card-subtitle">Track important contracts/whales for activity.</p>
                    <ul>
                        <li>Uniswap Router (0x1A2b...d4E) <button className="remove-btn">Remove</button></li>
                        <li>Giga-Whale 1 (0xFeD3...2F1) <button className="remove-btn">Remove</button></li>
                    </ul>
                    <input type="text" placeholder="Address or TX hash to watch" />
                    <button className="add-btn">Add</button>
                </div>
                
                {/* 3. Attack Statistics Chart - NEW SECTION */}
                <div className="full-width">
                     <AttackStatsChart chartData={attackStats} />
                </div>
            </div>
            
        </div>
    );
}

export default App;