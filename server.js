const express = require('express');
const WebSocket = require('ws');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3000;

let marketCache = {};
let historicalDataStorage = {}; 

const QUOTEX_ASSETS = [
    "AUD/CHF (OTC)", "CAD/JPY (OTC)", "CHF/JPY (OTC)", "EUR/CAD (OTC)", "EUR/AUD (OTC)", 
    "GBP/CHF (OTC)", "GBP/CAD (OTC)", "NZD/JPY (OTC)", "AUD/CAD (OTC)", "USD/MXN (OTC)", 
    "USD/ZAR (OTC)", "USD/TRY (OTC)", "USD/CNH (OTC)", "EUR/TRY (OTC)", "EUR/USD", 
    "GBP/USD", "USD/JPY", "USD/CHF", "AUD/USD", "USD/CAD", "NZD/USD", "EUR/JPY", "GBP/JPY"
];

function connectQuotexWS() {
    const ws = new WebSocket('wss://ws2.quotex.com/socket.io/?EIO=3&transport=websocket', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Origin': 'https://quotex.com'
        }
    });

    ws.on('open', () => {
        console.log('✅ Quotex WebSocket Connected for Chart Engine');
        ws.send('2'); 
    });

    ws.on('message', (data) => {
        const msg = data.toString();

        if (msg.startsWith('0')) {
            try { ws.send('40'); } catch (e) { ws.send('40'); }
        }

        if (msg.startsWith('42')) {
            try {
                const parsed = JSON.parse(msg.substring(2));
                const payload = parsed[1];

                if (payload) {
                    const symbol = payload.symbol || payload.pair || payload.asset;
                    if (symbol) {
                        const cleanSymbol = symbol.toUpperCase().trim();
                        payload.payout = payload.payout || 88; // Default Quotex Payout
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
                            high: Number(payload.high || payload.price || 1.0),
                            low: Number(payload.low || payload.price || 1.0),
                            close: closePrice,
                            color: candleColor,
                            payout: payload.payout
                        });

                        if (historicalDataStorage[cleanSymbol].length > 50) { 
                            historicalDataStorage[cleanSymbol].shift();
                        }
                    }
                }
            } catch (e) {}
        }
    });

    ws.on('close', () => { setTimeout(connectQuotexWS, 1000); });
    ws.on('error', () => { ws.close(); });

    setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) { ws.send('2'); }
    }, 20000);
}

connectQuotexWS();

// Self-ping to keep Render awake
function selfPingUptimer() {
    const renderAppName = process.env.RENDER_EXTERNAL_URL;
    if (renderAppName) {
        setInterval(() => {
            http.get(`${renderAppName}/private/qbot/qxproall.php`, (res) => {}).on('error', (err) => {});
        }, 300000); 
    }
}

// Chart-Ready Professional API Endpoint
app.get('/private/qbot/qxproall.php', (req, res) => {
    const startTime = process.hrtime();

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');

    const requestedPair = req.query.symbol || req.query.pair || "";
    const cleanPair = requestedPair.trim().toUpperCase();

    const diff = process.hrtime(startTime);
    const executionTimeSec = (diff[0] + diff[1] / 1e9).toFixed(4);

    // Populate fallback mock historical candles if cache is empty
    QUOTEX_ASSETS.forEach(pair => {
        const upperPair = pair.toUpperCase();
        if (!historicalDataStorage[upperPair] || historicalDataStorage[upperPair].length === 0) {
            let basePrice = upperPair.includes("JPY") ? 150.00 : 0.60000;
            let mockList = [];
            let nowTime = Math.floor(Date.now() / 1000) - (30 * 60);
            
            for (let i = 0; i < 30; i++) {
                let o = basePrice;
                let c = o + (Math.random() * 0.0004 - 0.0002);
                let h = Math.max(o, c) + 0.0001;
                let l = Math.min(o, c) - 0.0001;
                let color = c >= o ? "GREEN" : "RED";

                mockList.push({
                    time: nowTime + (i * 60),
                    open: Number(o.toFixed(5)),
                    high: Number(h.toFixed(5)),
                    low: Number(l.toFixed(5)),
                    close: Number(c.toFixed(5)),
                    color: color,
                    payout: 88
                });
                basePrice = c;
            }
            historicalDataStorage[upperPair] = mockList;
        }
    });

    // If specific pair requested (e.g. ?pair=AUD/CHF (OTC))
    if (cleanPair && historicalDataStorage[cleanPair]) {
        const currentCandles = historicalDataStorage[cleanPair];
        const latestCandle = currentCandles[currentCandles.length - 1];

        return res.status(200).json({
            Owner_Developer: "TANVIR HOSSAIN",
            Broker: "Quotex",
            Chart_Engine: "Active",
            Version: "6.00",
            Execution_time: `${executionTimeSec} second`,
            success: true,
            pair: cleanPair,
            current_price: latestCandle.close,
            payout: `${latestCandle.payout}%`,
            timeframe: "1m",
            candles_count: currentCandles.length,
            candles: currentCandles
        });
    }

    // If no pair specified, return all markets chart data summary
    let allMarketsData = {};
    for (const [pairSymbol, candles] of Object.entries(historicalDataStorage)) {
        allMarketsData[pairSymbol] = {
            current_price: candles[candles.length - 1].close,
            payout: `${candles[candles.length - 1].payout}%`,
            candles: candles
        };
    }

    return res.status(200).json({
        Owner_Developer: "TANVIR HOSSAIN",
        Broker: "Quotex",
        Chart_Engine: "Active",
        Version: "6.00",
        Execution_time: `${executionTimeSec} second`,
        success: true,
        total_markets: Object.keys(allMarketsData).length,
        markets: allMarketsData
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Quantex Chart API Server running on port ${PORT}`);
    selfPingUptimer();
});
