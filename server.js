const express = require('express');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 3000;

// Instant Memory Cache Storage
let marketCache = {};

function connectQuotexWS() {
    const ws = new WebSocket('wss://ws2.quotex.com/socket.io/?EIO=3&transport=websocket');

    ws.on('open', () => {
        console.log('Quotex WebSocket Connected');
        ws.send('2'); // Ping to initiate handshake
    });

    ws.on('message', (data) => {
        const msg = data.toString();

        if (msg.startsWith('0')) {
            ws.send('40');
        }

        if (msg.startsWith('42')) {
            try {
                const parsed = JSON.parse(msg.substring(2));
                const payload = parsed[1];

                if (payload) {
                    const symbol = payload.symbol || payload.pair;
                    if (symbol) {
                        const cleanSymbol = symbol.toUpperCase();
                        marketCache[cleanSymbol] = payload;
                    }
                }
            } catch (e) {
                // Ignore parse errors
            }
        }
    });

    ws.on('close', () => {
        setTimeout(connectQuotexWS, 1000);
    });

    ws.on('error', () => {
        ws.close();
    });

    setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send('2');
        }
    }, 20000);
}

connectQuotexWS();

// Ultra Fast API Endpoint
app.get('/private/qbot/qxproall.php', (req, res) => {
    const startTime = process.hrtime();

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');

    const requestedPair = req.query.symbol || req.query.pair || "";
    const cleanPair = requestedPair.trim().toUpperCase();

    // Execution time calculation in seconds
    const diff = process.hrtime(startTime);
    const executionTimeSec = (diff[0] + diff[1] / 1e9).toFixed(4);

    if (!cleanPair) {
        return res.status(200).json({
            Owner_Developer: "TANVIR HOSSAIN",
            Broker: "Quotex",
            Timeframe: "M1",
            Version: "2.10",
            Execution_time: `${executionTimeSec} second`,
            success: false,
            error: "Missing required parameter: pair or symbol",
            pair: "",
            count: 0,
            data: []
        });
    }

    const pairData = marketCache[cleanPair];

    if (pairData) {
        return res.status(200).json({
            Owner_Developer: "TANVIR HOSSAIN",
            Broker: "Quotex",
            Timeframe: "M1",
            Version: "2.10",
            Execution_time: `${executionTimeSec} second`,
            success: true,
            pair: cleanPair,
            count: Array.isArray(pairData) ? pairData.length : 1,
            data: pairData
        });
    } else {
        return res.status(200).json({
            Owner_Developer: "TANVIR HOSSAIN",
            Broker: "Quotex",
            Timeframe: "M1",
            Version: "2.10",
            Execution_time: `${executionTimeSec} second`,
            success: false,
            error: `No cached data found for pair: ${cleanPair}`,
            pair: cleanPair,
            count: 0,
            data: []
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
