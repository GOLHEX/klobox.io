const uWS = require('uWebSockets.js');
const jwt = require('jsonwebtoken');
const port = 9001;

const users = {}; // Хранилище пользователей для примера

const app = uWS.App();

app.ws('/*', {
  /* Обработчики событий WebSocket */
  open: (ws) => {
    console.log('New client connected to ws server');
  },
  message: (ws, message, isBinary) => {
    const msg = JSON.parse(Buffer.from(message).toString());

    // Регистрация пользователя
    if (msg.type === 'signup') {
      if (users[msg.username]) {
        ws.send(JSON.stringify({ type: 'error', error: 'Username already taken' }));
      } else {
        users[msg.username] = { password: msg.password }; // Здесь должно быть хэширование пароля
        ws.send(JSON.stringify({ type: 'signup', status: 'successful' }));
      }
    }

    // Вход пользователя
    if (msg.type === 'login') {
      if (users[msg.username] && users[msg.username].password === msg.password) { // Проверка пароля должна быть с хэшем
        const token = jwt.sign({ username: msg.username }, 'secretKey'); // Вместо 'secretKey' используйте ваш секретный ключ
        ws.send(JSON.stringify({ type: 'login', token: token }));
      } else {
        ws.send(JSON.stringify({ type: 'error', error: 'Invalid username or password' }));
      }
    }

    // Изменение цвета
    if (msg.type === 'cc' && msg.token) {
      try {
        const decoded = jwt.verify(msg.token, 'secretKey');
        if (decoded && users[decoded.username]) {
          lastColor = msg.color;
          console.log('Changed Color to: ', lastColor);
          app.publish('/*', JSON.stringify({ type: 'rnd', color: lastColor }));
        }
      } catch (error) {
        ws.send(JSON.stringify({ type: 'error', error: 'Invalid token' }));
      }
    }
  },
  close: (ws, code, message) => {
    console.log('Client disconnected');
  }
});

app.listen(port, (token) => {
  if (token) {
    console.log('WebSocket server started on port', port);
  } else {
    console.log('WebSocket server failed to listen');
  }
});
