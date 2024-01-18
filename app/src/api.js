import openSocket from 'socket.io-client';
const  socket = openSocket('http://localhost:8000');

function usersOnline(cb) {
  //const ListOnline = cb;
  //console.log("Get OnlineList")
  socket.on('getListOnline', ListOnline => cb(null, ListOnline));
  socket.emit('ListOnline');
}

function rioUser(rio) {
  console.log("Get user id")
  socket.on('userId', userId => rio(null, userId));
  socket.emit('newUser');
}

function rioUsers(listUsers){
  	socket.on('GetUsers', userId => listUsers(null, userId));
  	socket.emit('listUsers');
}

export { usersOnline, rioUser, rioUsers };