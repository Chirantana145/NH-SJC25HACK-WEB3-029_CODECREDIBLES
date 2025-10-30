# NH-SJC25HACK-WEB3-029_CODECREDIBLES
Hackathon MEV shield project

MEV-Shield DApp: Real-Time MEV Protection Platform
Project Overview
The MEV-Shield DApp is a proof-of-concept application designed to simulate the ecosystem of Maximal Extractable Value (MEV) and provide users with defensive tools to mitigate associated risks like Sandwich Attacks and Front-Running. It combines a modern React frontend with a secure Node.js backend connected to the Ethereum network via the Alchemy SDK.

Goal
To provide transparency into the "dark forest" of the public mempool by simulating real-time MEV opportunities and offering a trusted, private path for transaction submission.

System Architecture
The project follows a standard three-tier architecture: Client, Server, and External Services.

1. Frontend (Client) - React/Vite
Framework: React v18, using Vite for development.

Visualization: Uses react-chartjs-2 to display complex statistical data.

Real-Time Data: Connects to the backend via socket.io-client to receive an instant stream of simulated attack events.

Communication: Uses a Vite Proxy to redirect all /api calls to the Node.js backend on port 3001.

2. Backend (Server) - Node.js/Express
Framework: Node.js with the Express framework.

Real-Time Layer: Implements Socket.io to broadcast the Live Attack Feed to all connected clients.

Database: Uses SQLite3 (mevshield.db) to persist data, specifically logging all protected transaction submissions.

3. External Services & APIs
Alchemy SDK: Used for transaction analysis and data fetching. The backend utilizes the Alchemy SDK to validate or analyze transaction data (e.g., gas price, transaction value) when processing simulation requests.

🚀 Key Features and Working Mechanism
1. Live Attack Feed (Real-Time Simulation)
Mechanism: The server runs a continuous loop that triggers the local attack simulation logic. This logic generates a random attackType and riskScore (e.g., Sandwich Attack, 85/100) and immediately pushes the data to the frontend via Socket.io.

Purpose: To demonstrate the constant, underlying threat of MEV in the public mempool environment.

2. Transaction Simulator (/api/simulate)
Mechanism: When a user enters a transaction description (e.g., "Swap 10 ETH for DAI") or a raw TX hash:

The client sends the data to the /api/simulate endpoint.

The server's alchemyRiskAnalyzer processes the input.

If a real TX hash is provided, the analyzer uses the Alchemy API to fetch details and assigns a risk score based on transaction value and gas price heuristics.

Output: The DApp displays an AI-Rationale, an estimated Risk Score, and a potential Value Impact (loss) if the trade were unprotected.

3. Protected Trade Submission (/api/protect)
Mechanism: The Protected Trade component accepts a raw signed transaction (hex).

The client sends the rawTransaction to the /api/protect endpoint.

The server logs the transaction details to the protected_trades table in mevshield.db.

Simulation: This simulates the process of sending a transaction to a private relay (like Flashbots Protect), confirming that the user's trade bypassed the public mempool and was successfully recorded for protected inclusion.

Local Setup & Execution
Prerequisites
Node.js (LTS recommended)

Access to an Alchemy API Key (required in your .env file)

Installation
Server Setup: Navigate to the /server directory and install dependencies.

Bash

cd server
npm install
Client Setup: Navigate to the /client directory and install dependencies.

Bash

cd ../client
npm install
Running the Project
Start the Backend Server (First): From the /server directory:

Bash

npm start
Start the Frontend DApp: From the /client directory (this starts the Vite development server):

Bash

npm run dev
The DApp will open in your browser, typically at http://localhost:5173.
