const express = require('express');
const WebSocket = require('ws');
const app = express();
const PORT = process.env.PORT || 8080;

let marketStore = {};

function getFormattedData(symbol) {
  const data = marketStore[symbol];
  if (!data) {
    return {
      status: "error",
      message: `No live data received yet for symbol: ${symbol}`,
      developer: "TANVIR HOSSAIN",
      timestamp: Date.now()
    };
  }
  return {
    status: "success",
    developer: "TANVIR HOSSAIN",
    symbol: symbol,
    timestamp: Date.now(),
    candle: {
      open: data.open || 0,
      high: data.high || 0,
      low: data.low || 0,
      close: data.close || 0,
      bodySize: Math.abs((data.close || 0) - (data.open || 0)),
      direction: (data.close >= data.open) ? "CALL" : "PUT"
    },
    payout: data.payout || "85%"
  };
}

function connectQX() {
  const ws = new WebSocket('wss://ws2.quotex.com/socket.io/?EIO=3&transport=websocket');

  ws.on('open', () => {
    console.log('Connected to Quotex WebSocket stream.');
    ws.send('42["authorization",{"session":""}]');
  });

  ws.on('message', (rawData) => {
    const str = rawData.toString();

    if (str === '2') {
      ws.send('3');
      return;
    }

    if (str.startsWith('42')) {
      try {
        const parsed = JSON.parse(str.slice(2));
        const eventName = parsed[0];
        const payload = parsed[1];

        if (eventName === 'liveData' && payload) {
          const sym = payload.asset || payload.symbol;
          if (sym) {
            marketStore[sym] = { ...marketStore[sym], ...payload };
          }
        }

        if (eventName === 'assets/list' || eventName === 'payouts') {
          if (Array.isArray(payload)) {
            payload.forEach(item => {
              const sym = item.name || item.symbol;
              if (sym) {
                marketStore[sym] = marketStore[sym] || {};
                marketStore[sym].payout = item.payout ? `${item.payout}%` : "85%";
              }
            });
          }
        }
      } catch (e) {}
    }
  });

  ws.on('close', () => {
    setTimeout(connectQX, 3000);
  });

  ws.on('error', () => {
    ws.close();
  });
}

connectQX();

app.get('/private/qbot/qxproall.php', (req, res) => {
  const requestedSymbol = req.query.symbol ? req.query.symbol.toUpperCase() : null;

  if (!requestedSymbol) {
    let allSymbols = {};
    Object.keys(marketStore).forEach(sym => {
      allSymbols[sym] = getFormattedData(sym);
    });

    return res.json({
      status: "success",
      developer: "TANVIR HOSSAIN",
      total_active_assets: Object.keys(marketStore).length,
      timestamp: Date.now(),
      data: allSymbols
    });
  }

  res.json(getFormattedData(requestedSymbol));
});

app.get('/', (req, res) => {
  res.send('Quotex All-Market API Server is running live!');
});

app.listen(PORT, () => {
  console.log(`API Server started on port ${PORT}`);
});
