
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

const router = express.Router();
const BASE_URL = 'https://fapi.binance.com';
const API_KEY = process.env.BINANCE_API_KEY;
const API_SECRET = process.env.BINANCE_API_SECRET;

function getSignature(query) {
    return crypto.createHmac('sha256', API_SECRET).update(query).digest('hex');
}

async function binanceGet(path, params = {}) {
    const timestamp = Date.now();
    const query = new URLSearchParams({ ...params, timestamp }).toString();
    const signature = getSignature(query);
    const url = `${BASE_URL}${path}?${query}&signature=${signature}`;
    return axios.get(url, { headers: { 'X-MBX-APIKEY': API_KEY } });
}

router.get('/futures/account', async (req, res) => {
    try {
        const response = await binanceGet('/fapi/v2/account');
        res.json({ success: true, data: response.data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/futures/trades', async (req, res) => {
    try {
        const symbol = req.query.symbol || 'BTCUSDT';
        const response = await binanceGet('/fapi/v1/userTrades', { symbol });
        res.json({ success: true, data: response.data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
