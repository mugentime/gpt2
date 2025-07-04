// server.js (updated version)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const WebSocket = require('ws');
const http = require('http');
const binanceRoutes = require('./binance');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/binance', binanceRoutes);

app.use((req, res, next) => {
    if (req.method === 'POST') {
        console.log('Incoming POST:', req.url);
        console.log('Headers:', req.headers);
        console.log('Body:', req.body);
    }
    next();
});

let messages = [];
let messageCount = 0;
const clients = new Set();

wss.on('connection', (ws) => {
    clients.add(ws);
    ws.send(JSON.stringify({ type: 'initial_data', messages, messageCount }));
    ws.on('close', () => clients.delete(ws));
});

function broadcast(data) {
    const msg = JSON.stringify(data);
    clients.forEach(c => c.readyState === WebSocket.OPEN && c.send(msg));
}

function detectType(data) {
    if (typeof data === 'string') try { data = JSON.parse(data); } catch { return 'Text'; }
    if (data.action) return 'Alert';
    if (data.symbol) return 'Symbol Data';
    if (data.price) return 'Price Update';
    return 'Unknown';
}

app.post('/webhook', (req, res) => {
    const body = req.body;
    const msg = {
        id: Date.now() + Math.random(),
        timestamp: new Date(),
        data: body,
        type: detectType(body),
        ip: req.ip,
        headers: req.headers
    };
    messages.unshift(msg);
    if (++messageCount > 100) messages = messages.slice(0, 100);
    broadcast({ type: 'new_message', message: msg, messageCount });
    res.json({ success: true, message: 'Received', messageId: msg.id });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`\n🚀 Server running on http://localhost:${PORT}`);
});
