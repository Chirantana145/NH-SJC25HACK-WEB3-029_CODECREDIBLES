require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require("socket.io"); 
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// --- START GEMINI API CONFIGURATION ---
// 1. Safe SDK import and initialization (guarded when API key is absent)
const { GoogleGenAI } = require('@google/genai');
// Ensure GEMINI_API_KEY is set in your .env file. If it's missing we keep `ai` null
// so the server can run in offline/mock mode.
let ai = null;
if (process.env.GEMINI_API_KEY) {
    try {
        // Prefer passing an options object; the SDK expects an options parameter.
        ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    } catch (err) {
        console.warn('Gemini SDK init warning:', err.message);
        ai = null;
    }
} else {
    console.warn('GEMINI_API_KEY not set; Gemini AI disabled (using fallback responses).');
}
// --- END GEMINI API CONFIGURATION ---

// NOTE: Flashbots / private mempool specific integration is intentionally
// commented-out/removed in this branch. We keep a feature flag
// (`PRIVATE_MEMPOOL_ENABLED`) and generic messages for the UI, but any
// direct Flashbots SDK imports or relay submission code should remain
// disabled to avoid depending on Flashbots here.

const app = express();
const PORT = process.env.PORT || 3001;

// ALCHEMY_WSS_URL is now unused as per requirement

// --- Configuration Constants ---
const MEV_ATTACK_TYPES = ['Sandwich Attack', 'Front-Run', 'Arbitrage Exploitation', 'Liquidation Attack'];
const PRIVATE_MEMPOOL_ENABLED = true; 

// --- Database Setup (SQLite) ---
const DB_PATH = path.resolve(__dirname, 'mevshield.db');
let db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('Database connection error:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
    }
});

const initDb = () => {
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS protected_trades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            raw_tx TEXT NOT NULL,
            protection_relay_tx_hash TEXT,
            status TEXT NOT NULL,
            submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) console.error("Error creating table:", err.message);
            else console.log("Database table 'protected_trades' initialized.");
            
            if (process.argv.includes('--init-db')) {
                db.close();
                process.exit(0);
            }
        });
    });
};

if (process.argv.includes('--init-db')) {
    initDb();
    return;
} else {
    initDb(); 
}

// Middleware
app.use(cors({
    origin: "http://localhost:5173", 
    methods: ["GET", "POST"]
}));
app.use(express.json());

// --- WebSocket Setup (Socket.io for stable client communication) ---
const server = http.createServer(app);
const io = new Server(server, { 
    cors: {
        origin: "http://localhost:5173", 
        methods: ["GET", "POST"]
    }
}); 

let attackCounter = 0; 

io.on('connection', (socket) => {
    console.log(`NEW Socket.io client connected: ${socket.id}`);

    socket.on('disconnect', () => {
        console.log(`Socket.io client disconnected: ${socket.id}`);
    });
    
    // Send initial status message to the client
    // NOTE: Flashbots-specific wording removed/commented-out. We keep a
    // generic private mempool status for the UI but avoid referencing
    // a specific provider here.
    socket.emit('STATUS', { message: `Connected to MEV-Shield server. Private Mempool Status: ${PRIVATE_MEMPOOL_ENABLED ? 'Active (private mempool)' : 'Inactive'}.` });
});

// --- GEMINI AI Risk Analyzer (Real API Implementation) ---

/**
 * Calls the Gemini API to assess MEV risk.
 * @param {string} tradeData - Either a raw transaction or a trade description.
 * @returns {Promise<object>} - Analysis result including risk score and type.
 */
async function geminiRiskAnalyzer(tradeData) {
    let prompt;
    
    // Determine the prompt based on content type
    if (tradeData.startsWith('0xTx')) {
        // Use this prompt for the real-time *mock* attacks
        prompt = `Simulate an MEV attack scenario targeting a typical raw transaction like ${tradeData}. Provide a JSON object with: { "riskScore": "X/100", "attackType": "A single MEV type (Sandwich Attack, Front-Run, Liquidation Attack, Arbitrage Exploitation)", "rationale": "Brief, technical rationale for why this attack type is likely." }`;
    } else {
        // Use this prompt for the user's manual trade description
        prompt = `Analyze the potential MEV risk for this transaction description: "${tradeData}". Assume this is a DEX trade. Output a JSON object with: { "riskScore": "X/100", "attackType": "The most likely MEV type this trade attracts", "rationale": "Brief analysis of the risk and potential value impact." }`;
    }
    
    // If the Gemini SDK isn't initialized, return a graceful fallback so the
    // server can operate without an API key during development.
    if (!ai || !ai.models || !ai.models.generateContent) {
        console.warn('Gemini AI not configured; returning fallback analysis.');
        return {
            riskScore: "50/100",
            attackType: "AI Unavailable",
            rationale: "Gemini API key missing or SDK not initialized. Using fallback analysis."
        };
    }

    try {
        const response = await ai.models.generateContent({ 
            model: "gemini-2.5-flash", 
            contents: [{ role: "user", parts: [{ text: prompt }] }], 
            config: { 
                responseMimeType: "application/json" 
            } 
        });
        
        // Try to parse the model's text response as JSON
        return JSON.parse(response.text);
    } catch (e) {
        console.error("🚫 Gemini API or Parsing Error:", e.message);
        // Fallback in case of API error or invalid JSON output
        return { 
            riskScore: "50/100", 
            attackType: "API Error/Unknown MEV", 
            rationale: "AI risk analysis failed due to API error/quota limit. Proceed with caution." 
        };
    }
}


// --- Local Attack Generation and Manual Broadcast ---
// Generate purely local attacks (no AI call) for the live feed.
function generateLocalAttack() {
    attackCounter++;
    const rawTxMock = `0xTx${Math.random().toString(16).slice(2, 10)}${Date.now().toString().slice(-4)}`;
    const attackMethod = MEV_ATTACK_TYPES[Math.floor(Math.random() * MEV_ATTACK_TYPES.length)];

    return {
        id: attackCounter,
        transaction: rawTxMock.slice(0, 10) + '...',
        method: attackMethod,
        value: (Math.random() * 15 + 1).toFixed(4) + ' ETH',
        riskScore: (Math.floor(Math.random() * 50) + 50) + '/100', // Random high risk
        rationale: `Locally simulated. Attacker is monitoring ${attackMethod} opportunities.`,
        status: 'Local Simulation',
        timestamp: new Date().toLocaleTimeString(),
    };
}

// Broadcast a local attack message over Socket.io. Kept synchronous to simplify local use.
const broadcastAttack = () => {
    const attackMessage = generateLocalAttack();

    // Broadcast using Socket.io's io.emit
    io.emit('new_attack', attackMessage);

    console.log(`Broadcasting LOCAL attack ${attackMessage.id}: ${attackMessage.method} (Risk: ${attackMessage.riskScore})`);
};

// --- Integrated API Endpoints ---

// Protected Trade Endpoint (Simulates submission to a private relay)
app.post('/api/protect', (req, res) => {
    // rawTransaction will contain the JSON stringified trade details from the HTML
    const { rawTransaction } = req.body; 
    
    const mockTxHash = `0xsim-log-${Math.random().toString(16).slice(2, 10)}`;
    const status = 'Submitted_Protected'; 

    if (!rawTransaction) {
        return res.status(400).json({ success: false, message: 'Raw transaction data is required.' });
    }

    // Log the trade to the database
    const sql = 'INSERT INTO protected_trades (raw_tx, protection_relay_tx_hash, status) VALUES (?, ?, ?)';
    db.run(sql, [rawTransaction, mockTxHash, status], function(err) {
        if (err) {
            console.error('DB Insert Error:', err.message);
            return res.status(500).json({ success: false, message: 'Database error while logging trade.' });
        }
        res.json({ 
            success: true, 
            message: 'Trade successfully logged to Private MEV-Protection Relay.',
            txHash: mockTxHash,
            dbId: this.lastID
        });
    });
});

// NEW: Manual Trigger Endpoint (Called by the frontend button)
app.post('/api/trigger-attack', async (req, res) => {
    // Manually run the local attack simulation and broadcast it via Socket.io
    broadcastAttack(); 
    res.json({ success: true, message: 'Simulated attack broadcast initiated.' });
});

// Trade Simulator Endpoint (Mock) - **NOTE: This function must now be ASYNC**
app.post('/api/simulate', async (req, res) => {
    // Expects { stock: 'TATA', action: 'Buy', quantity: 10 } from the HTML client
    const { stock, action, quantity } = req.body;
    
    const tradeDescription = `${action} ${quantity} shares of ${stock} on a major Indian exchange.`;

    // Use AI for simulation advice
    const analysis = await geminiRiskAnalyzer(tradeDescription); 

    console.log(`Received simulation request for: ${tradeDescription}`);
    res.json({
        success: true,
        simulation: {
            risk: analysis.riskScore.split('/')[0], 
            details: analysis.rationale,
            attackType: analysis.attackType, 
        }
    });
});


// NEW: Attack Statistics Endpoint for Frontend Chart
app.get('/api/attack-stats', (req, res) => {
    // Mock data for yearly company/type attacks and loss
    const mockAttackStats = {
        title: 'Yearly Global MEV Attacks by Type (Simulated)',
        data: {
            labels: ['2022', '2023', '2024 (Est.)', '2025 (Est.)'],
            types: {
                'Sandwich Attack': [450, 620, 850, 1050], // Attacks in thousands
                'Front-Run': [300, 410, 500, 650],
                'Arbitrage Exploitation': [700, 850, 1000, 1200],
                'Liquidation Attack': [150, 200, 250, 300],
            },
            totalLossUSD: ['400M', '750M', '1.1B', '1.5B'] // Illustrative large loss
        }
    };
    res.json({ success: true, stats: mockAttackStats });
});


// Wallet Health Endpoint (Mock)
app.get('/api/wallet-health/:address', (req, res) => {
    const { address } = req.params;
    console.log(`Checking wallet health for: ${address}`);
    res.json({
        success: true,
        address: address,
        balance: '5.23 ETH',
        transactionsLast24h: 12,
        mevExposureScore: Math.floor(Math.random() * 100),
        alerts: [
            'High-risk token approval detected 3 days ago.', 
            PRIVATE_MEMPOOL_ENABLED ? 'System is configured for MEV protection.' : 'Warning: Not using a private mempool exposes you to MEV.',
        ],
    });
});

// Start the HTTP server
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});