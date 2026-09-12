const express = require('express');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 3000;

// Instant Response-এর জন্য ইন-মেমরি ক্যাশ অবজেক্ট
let marketCache = {
    all: {},
    symbols: {}
};

function connectQuotexWS() {
    const ws = new WebSocket('wss://ws2.quotex.com/socket.io/?EIO=3&transport=websocket');

    ws.on('open', () => {
        console.log('Connected to Quotex WebSocket');
        // Quotex হ্যান্ডশেক এবং সাবস্ক্রিপশন পিং
        ws.send('42["authorization",{"session":""}]');
    });

    ws.on('message', (data) => {
        const messageStr = data.toString();

        // ক্যান্ডেল ও পেআউট ডেটা পার্স করে ক্যাশে সেভ করা
        if (messageStr.startsWith('42')) {
            try {
                const parsed = JSON.parse(messageStr.substring(2));
                const event = parsed[0];
                const payload = parsed[1];

                if (event === 'candles/update' || event === 'history' || event === 'realtime') {
                    const symbol = payload.symbol || payload.pair;
                    if (symbol) {
                        marketCache.symbols[symbol] = {
                            symbol: symbol,
                            data: payload,
                            updated_at: Date.now()
                        };
                    }
                    marketCache.all[symbol || 'last_update'] = payload;
                }
            } catch (err) {
                // জেসন পার্স না হলে ইগনোর করবে
            }
        }
    });

    ws.on('close', () => {
        console.log('WS Connection closed. Reconnecting in 1s...');
        setTimeout(connectQuotexWS, 1000);
    });

    ws.on('error', (error) => {
        console.error('WS Error:', error);
        ws.close();
    });

    // প্রতি ২৫ সেকেন্ড পর পর পিং পাঠিয়ে কানেকশন একটিভ রাখা
    setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send('2');
        }
    }, 25000);
}

// ব্যাকগ্রাউন্ডে WebSocket চালু রাখা
connectQuotexWS();

// API Endpoint (Instant 0.0001s Response)
app.get('/private/qbot/qxproall.php', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');

    const requestedSymbol = req.query.symbol;

    if (requestedSymbol) {
        const symbolData = marketCache.symbols[requestedSymbol];
        if (symbolData) {
            return res.status(200).json({
                status: "success",
                developer: "TANVIR HOSSAIN",
                timestamp: Date.now(),
                data: symbolData
            });
        } else {
            return res.status(200).json({
                status: "waiting",
                message: `Caching live data for ${requestedSymbol}. Try again in a few seconds.`,
                developer: "TANVIR HOSSAIN",
                timestamp: Date.now()
            });
        }
    }

    // সব মার্কেটের ক্যাশ ডেটা ইন্সট্যান্ট রিটার্ন
    return res.status(200).json({
        status: "success",
        developer: "TANVIR HOSSAIN",
        timestamp: Date.now(),
        markets: marketCache.all
    });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
