const { Server } = require('socket.io');
let io = null;

function init(server) {
  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  // Simple auth passthrough (token can be validated if needed)
  io.use((socket, next) => {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    // TODO: verify JWT if we want to restrict WS
    return next();
  });

  io.on('connection', (socket) => {
    // console.log('WS connected', socket.id);
  });

  return io;
}

function getIO() {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
}

module.exports = { init, getIO };
