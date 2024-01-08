// const uWS = require('uWebSockets.js');
// const jwt = require('jsonwebtoken');
// const fs = require('fs');
// const port = 9001;


// // Загрузка SSL сертификатов
// const sslOptions = {
//   key: fs.readFileSync('ssl/key.pem'), // Путь к вашему SSL ключу
//   cert: fs.readFileSync('ssl/cert.pem') // Путь к вашему SSL сертификату
// };

// const users = {}; // Хранилище пользователей для примера

// const app = uWS.App();

// app.ws('/*', {
//   /* Обработчики событий WebSocket */
//   open: (ws) => {
//     console.log('New client connected to ws server');
//   },
//   message: (ws, message, isBinary) => {
//     const msg = JSON.parse(Buffer.from(message).toString());

//     // Регистрация пользователя
//     if (msg.type === 'signup') {
//       if (users[msg.username]) {
//         ws.send(JSON.stringify({ type: 'error', error: 'Username already taken' }));
//       } else {
//         users[msg.username] = { password: msg.password }; // Здесь должно быть хэширование пароля
//         ws.send(JSON.stringify({ type: 'signup', status: 'successful' }));
//       }
//     }

//     // Вход пользователя
//     if (msg.type === 'login') {
//       if (users[msg.username] && users[msg.username].password === msg.password) { // Проверка пароля должна быть с хэшем
//         const token = jwt.sign({ username: msg.username }, 'secretKey'); // Вместо 'secretKey' используйте ваш секретный ключ
//         ws.send(JSON.stringify({ type: 'login', token: token }));
//       } else {
//         ws.send(JSON.stringify({ type: 'error', error: 'Invalid username or password' }));
//       }
//     }

//     // Изменение цвета
//     if (msg.type === 'cc' && msg.token) {
//       try {
//         const decoded = jwt.verify(msg.token, 'secretKey');
//         if (decoded && users[decoded.username]) {
//           lastColor = msg.color;
//           console.log('Changed Color to: ', lastColor);
//           app.publish('/*', JSON.stringify({ type: 'rnd', color: lastColor }));
//         }
//       } catch (error) {
//         ws.send(JSON.stringify({ type: 'error', error: 'Invalid token' }));
//       }
//     }
//   },
//   close: (ws, code, message) => {
//     console.log('Client disconnected');
//   }
// });

// app.listen(port, (token) => {
//   if (token) {
//     console.log('WebSocket server started on port', port);
//   } else {
//     console.log('WebSocket server failed to listen');
//   }
// });
/* Test servers for autobahn, run with ASAN. /exit route shuts down everything */
const uWS = require('uWebSockets.js');

/* Keep track of all apps */
let apps = [];
let closing = false;

function listenWithSettings(settings) {
  /* These are our shared SSL options */
  let sslOptions = {
    key_file_name: 'ssl/key.pem',
    cert_file_name: 'ssl/cert.crt'
  };

  /* Create the app */
  let app = settings.ssl ? uWS.SSLApp(sslOptions) : uWS.App(sslOptions);

  /* Attach our behavior from settings */
  app.ws('/*', {
    compression: settings.compression,
    maxPayloadLength: 16 * 1024 * 1024,
    idleTimeout: 60,
    maxBackpressure: 16 * 1024 * 1204,
    open: (ws, req) => {
      if (settings.pubsub) {
        ws.subscribe('broadcast');
      }
    },
    message: (ws, message, isBinary) => {
      if (settings.pubsub) {
        ws.publish('broadcast', message, isBinary);
      } else {
        ws.send(message, isBinary, true);
      }
    }
  }).any('/exit', (res, req) => {
    /* Shut down everything on this route */
    if (!closing) {
      apps.forEach((a) => {
        uWS.us_listen_socket_close(a.listenSocket);
      });
      closing = true;
    }

    /* Close this connection */
    res.close();
  }).listen(settings.port, (listenSocket) => {
    if (listenSocket) {
      /* Add this app with its listenSocket */
      apps.push({
        app: app,
        listenSocket: listenSocket
      });
      console.log('Up and running: ' + JSON.stringify(settings));
    } else {
      /* Failure here */
      console.log('Failed to listen, closing everything now');
      process.exit(0);
    }
  });
}

/* non-SSL, non-compression */
listenWithSettings({
  port: 9001,
  ssl: false,
  compression: uWS.DISABLED,
  pubsub: false
});

/* SSL, shared compressor */
listenWithSettings({
  port: 9002,
  ssl: true,
  compression: uWS.SHARED_COMPRESSOR,
  pubsub: false
});

/* non-SSL, dedicated compressor */
listenWithSettings({
  port: 9003,
  ssl: false,
  compression: uWS.DEDICATED_COMPRESSOR,
  pubsub: false
});

/* pub/sub based, non-SSL, non-compression */
listenWithSettings({
  port: 9004,
  ssl: false,
  compression: uWS.DISABLED,
  pubsub: true
});

/* pub/sub based, SSL, non-compression */
listenWithSettings({
  port: 9005,
  ssl: true,
  compression: uWS.DISABLED,
  pubsub: true
});
