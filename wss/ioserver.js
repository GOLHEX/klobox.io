const express = require('express');
const http = require('http');
const socketIO = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? 'https://klobox.io:8443' : 'http://localhost:3000',
    methods: ["GET", "POST"]
  }
});

let lastColor;

io.on('connection', socket => {
  console.log('New client id: ' + socket.id + ' connected to https server ');

  // Send last color to user
  if (lastColor) {
    io.to(`${socket.id}`).emit('rnd', lastColor);
  } else {
    io.sockets.emit('rnd', '#F44336');
  }

  socket.on('cc', (cd) => {
    lastColor = cd;
    console.log('User id: ' + socket.id + ' Changed Color to: ', cd);
    console.log(socket.handshake.headers.host);
    io.sockets.emit('rnd', cd);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected, id:' + socket.id);
    io.clients((error, clients) => {
      if (error) throw error;
      console.log(clients);
    });
  });
});

const port = 3000;
server.listen(port, () => {

  process.on('SIGINT', () => {
    console.log('Received SIGINT. Shutting down.');
    server.close(() => {
      process.exit(0);
    });
  });
  
  process.on('SIGTERM', () => {
    console.log('Received SIGTERM. Shutting down.');
    server.close(() => {
      process.exit(0);
    });
  });
  console.log('Socket.io server started on port', port);
  
});
