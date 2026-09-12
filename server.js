const express = require('express');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 3000;

// Instant 0ms Latency Memory Cache
let marketCache = {};

function connectQuotexWS() {
    const ws = new WebSocket('wss://ws2.quotex.com/socket.io/?EIO=3&transport=websocket');

    ws.on('open', () => {
        console.log('Connected to Quotex WS');
        // Quotex Ping & Ping loop
        ws.send('2');
    });

    ws.on('message', (data) => {
        const msg = data.toString();

        // Quotex Session Ack
        if (msg.startsWith('0')) {
            ws.send('40');
        }

        // Live Market Updates
        if (msg.startsWith('42')) {
            try {
                const parsed = JSON.parse(msg.substring(2));
                const event = parsed[0];
                const payload = parsed[1];

                // Save symbol candle/payout data to RAM cache
                if (payload && (payload.symbol || payload.pair)) {
                    const sym = (payload.symbol || payload.pair).toUpperCase();
                    marketCache[sym] = {
                        symbol: sym,
                        live: payload,
                        timestamp: Date.now()
                    };
                } else if (typeof payload === 'object') {
                    // Cache generic market events
                    marketCache['latest'] = payload;
                }
            } catch (e) {
                // Ignore parse errors for raw packets
            }
        }
    });

    ws.on('close', () => {
        setTimeout(connectQuotexWS, 1000);
    });

    ws.on('error', () => {
        ws.close();
    });

    // Keeping connection alive every 20 seconds
    setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send('2');
        }
    }, 20000);
}

connectQuotexWS();

// 0ms Response API Endpoint
app.get('/private/qbot/qxproall.php', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');

    const requestedSymbol = req.query.symbol ? req.query.symbol.toUpperCase() : null;

    if (requestedSymbol) {
        if (marketCache[requestedSymbol]) {
            return res.status(200).json({
                status: "success",
                developer: "TANVIR HOSSAIN",
                timestamp: Date.now(),
                data: marketCache[requestedSymbol]
            });
        } else {
            return res.status(200).json({
                status: "success",
                message: "Awaiting next ticker update",
                developer: "TANVIR HOSSAIN",
                available_cached_symbols: Object.keys(marketCache),
                timestamp: Date.now()
            });
        }
    }

    // Return all cached symbols instantly
    return res.status(200).json({
        status: "success",
        developer: "TANVIR HOSSAIN",
        count: Object.keys(marketCache).length,
        timestamp: Date.now(),
        markets: marketCache
    });
});

app.listen(PORT, () => {
    console.log(`Server active on port ${PORT}`);
});
