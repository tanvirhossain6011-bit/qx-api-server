const express = require('express');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 3000;

let liveMarketStore = {};

function connectQuotexRealWebSocket() {
    // Exact browser emulation headers to bypass Quotex cloudflare/firewall on free cloud
    const ws = new WebSocket('wss://ws2.quotex.com/socket.io/?EIO=3&transport=websocket', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Origin': 'https://quotex.com',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache'
        }
    });

    ws.on('open', () => {
        console.log('⚡ Connected to Quotex Verified Socket Stream');
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
                    const rawSymbol = payload.symbol || payload.pair || payload.asset || "";
                    if (rawSymbol) {
                        const cleanSymbol = rawSymbol.toUpperCase().trim();
                        
                        // Exact live payout parsing from broker payload
                        const livePayout = payload.payout !== undefined ? Number(payload.payout) : (payload.percent !== undefined ? Number(payload.percent) : 84);
                        
                        let openPrice = Number(payload.open || payload.price || 1.0);
                        let closePrice = Number(payload.close || payload.price || 1.0);
                        let highPrice = Number(payload.high || payload.price || 1.0);
                        let lowPrice = Number(payload.low || payload.price || 1.0);
                        let candleColor = closePrice >= openPrice ? "GREEN" : "RED";

                        if (!liveMarketStore[cleanSymbol]) {
                            liveMarketStore[cleanSymbol] = {
                                payout: livePayout,
                                candles: []
                            };
                        }

                        liveMarketStore[cleanSymbol].payout = livePayout;
                        const candleList = liveMarketStore[cleanSymbol].candles;
                        const currentTime = Math.floor(Date.now() / 1000);

                        if (candleList.length > 0 && (currentTime - candleList[candleList.length - 1].time < 60)) {
                            let activeCandle = candleList[candleList.length - 1];
                            activeCandle.close = closePrice;
                            activeCandle.high = Math.max(activeCandle.high, highPrice);
                            activeCandle.low = Math.min(activeCandle.low, lowPrice);
                            activeCandle.color = activeCandle.close >= activeCandle.open ? "GREEN" : "RED";
                        } else {
                            candleList.push({
                                time: currentTime,
                                open: openPrice,
                                high: highPrice,
                                low: lowPrice,
                                close: closePrice,
                                color: candleColor
                            });

                            if (candleList.length > 100) {
                                candleList.shift();
                            }
                        }
                    }
                }
            } catch (e) {}
        }
    });

    ws.on('close', () => {
        setTimeout(connectQuotexRealWebSocket, 500);
    });

    ws.on('error', () => {
        ws.close();
    });

    setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) { ws.send('2'); }
    }, 20000);
}

connectQuotexRealWebSocket();

app.get('/private/qbot/qxproall.php', (req, res) => {
    const startTime = process.hrtime();

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');

    const requestedPair = req.query.symbol || req.query.pair || "";
    const cleanPair = requestedPair.trim().toUpperCase();

    const diff = process.hrtime(startTime);
    const executionTimeSec = (diff[0] + diff[1] / 1e9).toFixed(4);

    if (cleanPair) {
        const marketData = liveMarketStore[cleanPair];
        
        if (!marketData || marketData.candles.length === 0) {
            return res.status(200).json({
                Owner_Developer: "TANVIR HOSSAIN",
                Broker: "Quotex",
                Status: "Syncing Live Stream",
                success: false,
                message: `Initializing live feed for ${cleanPair}. Please refresh.`
            });
        }

        const latestCandle = marketData.candles[marketData.candles.length - 1];

        return res.status(200).json({
            Owner_Developer: "TANVIR HOSSAIN",
            Broker: "Quotex",
            Mode: "Real-Time Direct Stream",
            Version: "8.00",
            Execution_time: `${executionTimeSec} second`,
            success: true,
            pair: cleanPair,
            live_payout: `${marketData.payout}%`,
            current_price: latestCandle.close,
            timeframe: "1m",
            total_candles: marketData.candles.length,
            candles: marketData.candles
        });
    }

    let formattedAllMarkets = {};
    for (const [pairSymbol, info] of Object.entries(liveMarketStore)) {
        if (info.candles.length > 0) {
            const lastCandle = info.candles[info.candles.length - 1];
            formattedAllMarkets[pairSymbol] = {
                live_payout: `${info.payout}%`,
                current_price: lastCandle.close,
                candles: info.candles
            };
        }
    }

    return res.status(200).json({
        Owner_Developer: "TANVIR HOSSAIN",
        Broker: "Quotex",
        Mode: "Real-Time Direct Stream",
        Version: "8.00",
        Execution_time: `${executionTimeSec} second`,
        success: true,
        active_markets_count: Object.keys(formattedAllMarkets).length,
        markets: formattedAllMarkets
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Ultimate Real-Time QX Server running on port ${PORT}`);
});
