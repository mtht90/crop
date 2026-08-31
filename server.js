const express = require('express');
const http = require('http');
const os = require('os');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 2;

const app = express();
app.use(express.static('public'));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Index i holds the controller ws assigned to player (i + 1), or null when free.
const controllerSlots = new Array(MAX_PLAYERS).fill(null);
const gameSockets = new Set();

function assignSlot(ws) {
  const index = controllerSlots.indexOf(null);
  if (index === -1) return -1;
  controllerSlots[index] = ws;
  return index + 1;
}

function freeSlot(ws) {
  const index = controllerSlots.indexOf(ws);
  if (index !== -1) controllerSlots[index] = null;
}

function broadcastToGames(payload) {
  const message = JSON.stringify(payload);
  for (const socket of gameSockets) {
    if (socket.readyState === WebSocket.OPEN) socket.send(message);
  }
}

wss.on('connection', (ws) => {
  ws.role = null;
  ws.player = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (ws.role === null) {
      if (msg.type !== 'hello') return;

      if (msg.role === 'game') {
        ws.role = 'game';
        gameSockets.add(ws);
        const connected = controllerSlots
          .map((slot, i) => (slot ? i + 1 : null))
          .filter((player) => player !== null);
        ws.send(JSON.stringify({ type: 'players', connected }));
      } else if (msg.role === 'controller') {
        const player = assignSlot(ws);
        if (player === -1) {
          ws.send(JSON.stringify({ type: 'full' }));
          ws.close();
          return;
        }
        ws.role = 'controller';
        ws.player = player;
        ws.send(JSON.stringify({ type: 'assigned', player }));
        broadcastToGames({ type: 'player-connected', player });
      }
      return;
    }

    if (ws.role === 'controller') {
      broadcastToGames({ ...msg, player: ws.player });
    }
  });

  ws.on('close', () => {
    if (ws.role === 'game') {
      gameSockets.delete(ws);
    } else if (ws.role === 'controller') {
      freeSlot(ws);
      broadcastToGames({ type: 'player-disconnected', player: ws.player });
    }
  });
});

function getLanIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log(`Controller: http://${getLanIp()}:${PORT}/controller.html`);
});
