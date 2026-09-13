const express = require('express');
const WebSocket = require('ws');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3000;

// Instant Memory Cache for All Markets
let marketCache = {};
let historicalDataStorage = {}; 

function connectQuotexWS() {
    const ws = new WebSocket('wss://ws2.quotex.com/socket.io/?EIO=3&transport=websocket', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Origin': 'https://quotex.com'
        }
    });

    ws.on('open', () => {
        console.log('✅ Quotex WebSocket Connected Successfully');
        ws.send('2'); // Ping to initiate handshake
    });

    ws.on('message', (data) => {
        const msg = data.toString();

        if (msg.startsWith('0')) {
            try {
                ws.send('40');
            } catch (e) {
                ws.send('40');
            }
        }

        if (msg.startsWith('42')) {
            try {
                const parsed = JSON.parse(msg.substring(2));
                const payload = parsed[1];

                if (payload) {
                    const symbol = payload.symbol || payload.pair || payload.asset;
                    if (symbol) {
                        const cleanSymbol = symbol.toUpperCase();
                        
                        payload.payout = payload.payout || 92; 
                        marketCache[cleanSymbol] = payload;

                        if (!historicalDataStorage[cleanSymbol]) {
                            historicalDataStorage[cleanSymbol] = [];
                        }
                        
                        let openPrice = Number(payload.open || payload.price || 1.0);
                        let closePrice = Number(payload.close || payload.price || 1.0);
                        let candleColor = closePrice >= openPrice ? "GREEN" : "RED";

                        historicalDataStorage[cleanSymbol].push({
                            time: Math.floor(Date.now() / 1000),
                            open: openPrice,
                            close: closePrice,
                            high: Number(payload.high || payload.price || 1.0),
                            low: Number(payload.low || payload.price || 1.0),
                            color: candleColor, // Explicitly stating Green or Red
                            payout: `${payload.payout}%`
                        });

                        if (historicalDataStorage[cleanSymbol].length > 30) { 
                            historicalDataStorage[cleanSymbol].shift();
                        }
                    }
                }
            } catch (e) {
                // Ignore parse errors
            }
        }
    });

    ws.on('close', () => {
        console.log('⚠️ WebSocket Closed. Reconnecting in 1s...');
        setTimeout(connectQuotexWS, 1000);
    });

    ws.on('error', (err) => {
        console.log('❌ WebSocket Error:', err.message);
        ws.close();
    });

    setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send('2');
        }
    }, 20000);
}

connectQuotexWS();

// Self-Ping Uptimer to prevent Render free tier from sleeping
function selfPingUptimer() {
    const renderAppName = process.env.RENDER_EXTERNAL_URL;
    if (renderAppName) {
        setInterval(() => {
            http.get(`${renderAppName}/private/qbot/qxproall.php`, (res) => {}).on('error', (err) => {});
        }, 300000); 
        console.log('🚀 Built-in Uptime Pinger Active for Render!');
    }
}

// All Markets API Endpoint (No pair parameter required)
app.get('/private/qbot/qxproall.php', (req, res) => {
    const startTime = process.hrtime();

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');

    const diff = process.hrtime(startTime);
    const executionTimeSec = (diff[0] + diff[1] / 1e9).toFixed(4);

    // If cache is empty on cold start, generate sample multi-market fallback data
    if (Object.keys(historicalDataStorage).length === 0) {
        const defaultPairs = ["EURUSD_OTC", "GBPUSD_OTC", "AUDUSD_OTC", "USDJPY_OTC"];
        defaultPairs.forEach(pair => {
            let basePrice = 1.08500;
            let mockList = [];
            let nowTime = Math.floor(Date.now() / 1000) - (10 * 60);
            
            for (let i = 0; i < 10; i++) {
                let o = basePrice;
                let c = o + (Math.random() * 0.0004 - 0.0002);
                let h = Math.max(o, c) + 0.0001;
                let l = Math.min(o, c) - 0.0001;
                let color = c >= o ? "GREEN" : "RED";

                mockList.push({
                    time: nowTime + (i * 60),
                    open: Number(o.toFixed(5)),
                    close: Number(c.toFixed(5)),
                    high: Number(h.toFixed(5)),
                    low: Number(l.toFixed(5)),
                    color: color,
                    payout: "92%"
                });
                basePrice = c;
            }
            historicalDataStorage[pair] = mockList;
        });
    }

    // Format all markets data into a clean structured response object
    let allMarketsFormatted = {};
    for (const [pairSymbol, candles] of Object.entries(historicalDataStorage)) {
        allMarketsFormatted[pairSymbol] = {
            payout: "92%",
            total_candles: candles.length,
            candles: candles
        };
    }

    return res.status(200).json({
        Owner_Developer: "TANVIR HOSSAIN",
        Broker: "Quotex",
        Timeframe: "M1",
        Version: "4.00",
        Execution_time: `${executionTimeSec} second`,
        success: true,
        markets_count: Object.keys(allMarketsFormatted).length,
        data: allMarketsFormatted
    });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    selfPingUptimer();
});
