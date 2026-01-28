const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
let io = null;

const ADMIN_ROOM = 'role:admin';
const userRoom = (userId) => `user:${userId}`;

function init(server) {
  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth && socket.handshake.auth.token;
      if (!token) return next(new Error('Not authorized'));
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findByPk(decoded.id);
      if (!user) return next(new Error('Not authorized'));
      const u = typeof user?.toJSON === 'function' ? user.toJSON() : user;
      const id = u?._id || u?.id;
      const role = u?.role || 'user';
      if (!id) return next(new Error('Not authorized'));
      socket.data.user = { id, role };
      return next();
    } catch (e) {
      return next(new Error('Not authorized'));
    }
  });

  io.on('connection', (socket) => {
    const u = socket.data && socket.data.user;
    if (u && u.id) {
      try {
        socket.join(userRoom(u.id));
      } catch {}
    }
    if (u && u.role === 'admin') {
      try {
        socket.join(ADMIN_ROOM);
      } catch {}
    }
  });

  return io;
}

function getIO() {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
}

module.exports = { init, getIO, ADMIN_ROOM, userRoom };
