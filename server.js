const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// In-memory storage for messages (in production, use a database)
let messages = [];
let messageCount = 0;

// WebSocket connections for real-time updates
const clients = new Set();

// WebSocket connection handler
wss.on('connection', (ws) => {
    console.log('New WebSocket client connected');
    clients.add(ws);
    
    // Send current messages to new client
    ws.send(JSON.stringify({
        type: 'initial_data',
        messages: messages,
        messageCount: messageCount
    }));
    
    ws.on('close', () => {
        console.log('WebSocket client disconnected');
        clients.delete(ws);
    });
    
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        clients.delete(ws);
    });
});

// Broadcast message to all connected clients
function broadcastToClients(data) {
    const message = JSON.stringify(data);
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// Utility function to detect message type
function detectMessageType(data) {
    if (typeof data === 'string') {
        try {
            data = JSON.parse(data);
        } catch (e) {
            return 'Text';
        }
    }
    
    if (data.action) return 'Alert';
    if (data.symbol) return 'Symbol Data';
    if (data.price) return 'Price Update';
    if (data.signal) return 'Signal';
    if (data.strategy) return 'Strategy';
    return 'Unknown';
}

// Main webhook endpoint for TradingView
app.post('/webhook', (req, res) => {
    try {
        const timestamp = new Date();
        const clientIP = req.ip || req.connection.remoteAddress;
        
        console.log(`[${timestamp.toISOString()}] Webhook received from ${clientIP}`);
        console.log('Headers:', req.headers);
        console.log('Body:', req.body);
        
        // Create message object
        const message = {
            id: Date.now() + Math.random(),
            timestamp: timestamp,
            data: req.body,
            type: detectMessageType(req.body),
            ip: clientIP,
            headers: {
                'content-type': req.headers['content-type'],
                'user-agent': req.headers['user-agent']
            }
        };
        
        // Store message
        messages.unshift(message);
        messageCount++;
        
        // Keep only last 100 messages to prevent memory issues
        if (messages.length > 100) {
            messages = messages.slice(0, 100);
        }
        
        // Broadcast to connected clients
        broadcastToClients({
            type: 'new_message',
            message: message,
            messageCount: messageCount
        });
        
        // Log successful processing
        console.log(`Message processed successfully. Total messages: ${messageCount}`);
        
        // Send success response
        res.status(200).json({
            success: true,
            message: 'Webhook received successfully',
            timestamp: timestamp.toISOString(),
            messageId: message.id
        });
        
    } catch (error) {
        console.error('Error processing webhook:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
});

// API endpoint to get all messages
app.get('/api/messages', (req, res) => {
    res.json({
        messages: messages,
        messageCount: messageCount,
        timestamp: new Date().toISOString()
    });
});

// API endpoint to clear all messages
app.delete('/api/messages', (req, res) => {
    messages = [];
    messageCount = 0;
    
    broadcastToClients({
        type: 'messages_cleared',
        messageCount: 0
    });
    
    res.json({
        success: true,
        message: 'All messages cleared'
    });
});

// API endpoint to get server stats
app.get('/api/stats', (req, res) => {
    res.json({
        messageCount: messageCount,
        lastMessage: messages.length > 0 ? messages[0].timestamp : null,
        uptime: process.uptime(),
        connectedClients: clients.size,
        memoryUsage: process.memoryUsage()
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Test endpoint to simulate webhook
app.post('/test-webhook', (req, res) => {
    const testData = req.body || {
        action: "TEST",
        symbol: "BTCUSDT",
        price: Math.floor(Math.random() * 50000) + 30000,
        timestamp: new Date().toISOString(),
        test: true
    };
    
    // Simulate the webhook call
    req.body = testData;
    
    // Process as normal webhook
    const timestamp = new Date();
    const message = {
        id: Date.now() + Math.random(),
        timestamp: timestamp,
        data: testData,
        type: detectMessageType(testData),
        ip: 'TEST',
        headers: { 'content-type': 'application/json' }
    };
    
    messages.unshift(message);
    messageCount++;
    
    if (messages.length > 100) {
        messages = messages.slice(0, 100);
    }
    
    broadcastToClients({
        type: 'new_message',
        message: message,
        messageCount: messageCount
    });
    
    res.json({
        success: true,
        message: 'Test webhook sent',
        data: testData
    });
});

// Serve the frontend HTML
app.get('/', (req, res) => {
    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TradingView Webhook Interface</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            color: #333;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }

        .header {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 30px;
            text-align: center;
            margin-bottom: 30px;
            border: 1px solid rgba(255, 255, 255, 0.2);
        }

        .header h1 {
            color: white;
            font-size: 2.5em;
            margin-bottom: 10px;
            text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
        }

        .header p {
            color: rgba(255, 255, 255, 0.9);
            font-size: 1.1em;
        }

        .dashboard {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }

        .stats-card {
            background: rgba(255, 255, 255, 0.95);
            border-radius: 15px;
            padding: 25px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            text-align: center;
        }

        .stat-number {
            font-size: 2.5em;
            font-weight: bold;
            color: #667eea;
            margin-bottom: 10px;
        }

        .stat-label {
            font-size: 1.1em;
            color: #666;
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .webhook-section {
            background: rgba(255, 255, 255, 0.95);
            border-radius: 15px;
            padding: 30px;
            margin-bottom: 30px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
        }

        .webhook-url {
            background: #f8f9fa;
            border: 2px solid #e9ecef;
            border-radius: 8px;
            padding: 15px;
            font-family: 'Courier New', monospace;
            font-size: 1.1em;
            word-break: break-all;
            margin: 15px 0;
        }

        .btn {
            background: linear-gradient(45deg, #667eea, #764ba2);
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 1em;
            transition: all 0.3s ease;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
            margin: 5px;
        }

        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
        }

        .btn.danger {
            background: linear-gradient(45deg, #dc3545, #c82333);
        }

        .btn.success {
            background: linear-gradient(45deg, #28a745, #20c997);
        }

        .messages-container {
            background: rgba(255, 255, 255, 0.95);
            border-radius: 15px;
            padding: 30px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
            max-height: 600px;
            overflow-y: auto;
        }

        .message {
            background: #f8f9fa;
            border-left: 4px solid #667eea;
            padding: 20px;
            margin-bottom: 20px;
            border-radius: 8px;
            transition: all 0.3s ease;
        }

        .message:hover {
            transform: translateX(5px);
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
        }

        .message-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
            flex-wrap: wrap;
        }

        .message-time {
            color: #666;
            font-size: 0.9em;
        }

        .message-content {
            background: white;
            padding: 15px;
            border-radius: 5px;
            font-family: 'Courier New', monospace;
            white-space: pre-wrap;
            word-wrap: break-word;
            border: 1px solid #e9ecef;
            font-size: 0.9em;
        }

        .status {
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 0.8em;
            font-weight: bold;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .status.online {
            background: #d4edda;
            color: #155724;
        }

        .status.offline {
            background: #f8d7da;
            color: #721c24;
        }

        .no-messages {
            text-align: center;
            color: #666;
            font-style: italic;
            padding: 40px;
        }

        .connection-status {
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 10px 20px;
            border-radius: 20px;
            font-size: 0.9em;
            font-weight: bold;
            z-index: 1000;
        }

        @media (max-width: 768px) {
            .dashboard {
                grid-template-columns: 1fr;
            }
            
            .header h1 {
                font-size: 2em;
            }
            
            .message-header {
                flex-direction: column;
                align-items: flex-start;
            }
        }
    </style>
</head>
<body>
    <div class="connection-status status online" id="connectionStatus">🟢 Connected</div>
    
    <div class="container">
        <div class="header">
            <h1>🔗 TradingView Webhook Interface</h1>
            <p>Real-time webhook message handler and dashboard</p>
        </div>

        <div class="dashboard">
            <div class="stats-card">
                <div class="stat-number" id="messageCount">0</div>
                <div class="stat-label">Messages Received</div>
            </div>
            <div class="stats-card">
                <div class="stat-number" id="lastMessageTime">Never</div>
                <div class="stat-label">Last Message</div>
            </div>
            <div class="stats-card">
                <div class="stat-number" id="connectedClients">0</div>
                <div class="stat-label">Connected Clients</div>
            </div>
        </div>

        <div class="webhook-section">
            <h2>📡 Webhook Endpoint</h2>
            <p>Use this URL in your TradingView alerts:</p>
            <div class="webhook-url" id="webhookUrl"></div>
            <button class="btn" onclick="copyWebhookUrl()">📋 Copy URL</button>
            <button class="btn success" onclick="testWebhook()">🧪 Test Webhook</button>
        </div>

        <div class="messages-container">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap;">
                <h2>📨 Received Messages</h2>
                <div>
                    <button class="btn" onclick="refreshMessages()">🔄 Refresh</button>
                    <button class="btn danger" onclick="clearMessages()">🗑️ Clear All</button>
                </div>
            </div>
            <div id="messagesArea">
                <div class="no-messages">
                    Loading messages...
                </div>
            </div>
        </div>
    </div>

    <script>
        let ws = null;
        let reconnectAttempts = 0;
        const maxReconnectAttempts = 5;
        
        // Get the webhook URL
        const webhookUrl = window.location.origin + '/webhook';
        document.getElementById('webhookUrl').textContent = webhookUrl;
        
        // Initialize WebSocket connection
        function initWebSocket() {
            const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = wsProtocol + '//' + window.location.host;
            
            ws = new WebSocket(wsUrl);
            
            ws.onopen = function() {
                console.log('WebSocket connected');
                document.getElementById('connectionStatus').innerHTML = '🟢 Connected';
                document.getElementById('connectionStatus').className = 'connection-status status online';
                reconnectAttempts = 0;
            };
            
            ws.onmessage = function(event) {
                const data = JSON.parse(event.data);
                handleWebSocketMessage(data);
            };
            
            ws.onclose = function() {
                console.log('WebSocket disconnected');
                document.getElementById('connectionStatus').innerHTML = '🔴 Disconnected';
                document.getElementById('connectionStatus').className = 'connection-status status offline';
                
                // Attempt to reconnect
                if (reconnectAttempts < maxReconnectAttempts) {
                    reconnectAttempts++;
                    setTimeout(initWebSocket, 2000 * reconnectAttempts);
                }
            };
            
            ws.onerror = function(error) {
                console.error('WebSocket error:', error);
            };
        }
        
        function handleWebSocketMessage(data) {
            switch(data.type) {
                case 'initial_data':
                    updateDashboard(data.messageCount, data.messages);
                    renderMessages(data.messages);
                    break;
                case 'new_message':
                    updateDashboard(data.messageCount, [data.message]);
                    addMessageToUI(data.message);
                    break;
                case 'messages_cleared':
                    updateDashboard(0, []);
                    renderMessages([]);
                    break;
            }
        }
        
        function updateDashboard(messageCount, messages) {
            document.getElementById('messageCount').textContent = messageCount;
            
            if (messages && messages.length > 0) {
                const lastTime = new Date(messages[0].timestamp);
                document.getElementById('lastMessageTime').textContent = lastTime.toLocaleTimeString();
            } else if (messageCount === 0) {
                document.getElementById('lastMessageTime').textContent = 'Never';
            }
        }
        
        function renderMessages(messages) {
            const messagesArea = document.getElementById('messagesArea');
            
            if (!messages || messages.length === 0) {
                messagesArea.innerHTML = '<div class="no-messages">No webhook messages received yet. Configure your TradingView alerts to send to the webhook URL above.</div>';
                return;
            }
            
            messagesArea.innerHTML = messages.map(message => createMessageHTML(message)).join('');
        }
        
        function addMessageToUI(message) {
            const messagesArea = document.getElementById('messagesArea');
            const noMessages = messagesArea.querySelector('.no-messages');
            
            if (noMessages) {
                messagesArea.innerHTML = '';
            }
            
            const messageElement = document.createElement('div');
            messageElement.innerHTML = createMessageHTML(message);
            messagesArea.insertBefore(messageElement.firstChild, messagesArea.firstChild);
        }
        
        function createMessageHTML(message) {
            const timestamp = new Date(message.timestamp);
            const dataString = typeof message.data === 'string' ? message.data : JSON.stringify(message.data, null, 2);
            
            return \`
                <div class="message">
                    <div class="message-header">
                        <div>
                            <strong>\${message.type}</strong>
                            <span style="margin-left: 10px; color: #999; font-size: 0.8em;">IP: \${message.ip}</span>
                        </div>
                        <span class="message-time">\${timestamp.toLocaleString()}</span>
                    </div>
                    <div class="message-content">\${dataString}</div>
                </div>
            \`;
        }
        
        function copyWebhookUrl() {
            const url = document.getElementById('webhookUrl').textContent;
            navigator.clipboard.writeText(url).then(() => {
                const btn = event.target;
                const originalText = btn.textContent;
                btn.textContent = '✅ Copied!';
                setTimeout(() => {
                    btn.textContent = originalText;
                }, 2000);
            });
        }
        
        async function testWebhook() {
            try {
                const response = await fetch('/test-webhook', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        action: "TEST",
                        symbol: "BTCUSDT",
                        price: Math.floor(Math.random() * 50000) + 30000,
                        timestamp: new Date().toISOString(),
                        message: "Test webhook from dashboard"
                    })
                });
                
                const result = await response.json();
                console.log('Test webhook result:', result);
            } catch (error) {
                console.error('Error sending test webhook:', error);
            }
        }
        
        async function refreshMessages() {
            try {
                const response = await fetch('/api/messages');
                const data = await response.json();
                updateDashboard(data.messageCount, data.messages);
                renderMessages(data.messages);
            } catch (error) {
                console.error('Error refreshing messages:', error);
            }
        }
        
        async function clearMessages() {
            if (confirm('Are you sure you want to clear all messages?')) {
                try {
                    const response = await fetch('/api/messages', {
                        method: 'DELETE'
                    });
                    const result = await response.json();
                    console.log('Messages cleared:', result);
                } catch (error) {
                    console.error('Error clearing messages:', error);
                }
            }
        }
        
        // Initialize the application
        document.addEventListener('DOMContentLoaded', function() {
            initWebSocket();
            refreshMessages();
        });
    </script>
</body>
</html>
    `;
    
    res.send(htmlContent);
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Server error:', error);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
    });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`
🚀 TradingView Webhook Server is running!
📡 Webhook endpoint: http://localhost:${PORT}/webhook
🌐 Dashboard: http://localhost:${PORT}
🔧 API endpoints:
   - GET /api/messages - Get all messages
   - DELETE /api/messages - Clear all messages
   - GET /api/stats - Get server statistics
   - GET /health - Health check
   - POST /test-webhook - Test webhook endpoint
    `);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down server...');
    server.close(() => {
        console.log('Server closed.');
        process.exit(0);
    });
});

module.exports = app;