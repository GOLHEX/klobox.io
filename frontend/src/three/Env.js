//frontend\src\three\Env.js
import React, { Component } from "react"
//import uWS from "uWebSockets.js"
import MetaMaskSDK from '@metamask/sdk';
import Tetra from "./Tetra"
import GOL from "./GameOfLife"
import W from "../wrapper/W"
import './Env.css'

class Env extends Component {
  constructor(props) {
    super(props);
    this.socket = null;
    this.handleClick = this.handleClick.bind(this);
    this.userPos = this.userPos.bind(this);
    this.lastPose = { x: '15', y: '15' };
    this.state = {
      endpoint: 'ws://localhost:9001',
      username: 'user',
      password: 'pass',
      token: '',
      color: '#795548',
      rnd: 14,
      colors: [
                  '#24A14E',
                  '#E91E63',
                  '#92329B',
                  '#673AB7',
                  '#3F51B5',
                  '#2196F3',
                  '#03A9F4',
                  '#00BCD4',
                  '#009688',
                  '#4CAF50',
                  '#8BC34A',
                  '#CDDC39',
                  '#FFEB3B',
                  '#FFC107',
                  '#FF9800',
                  '#FF5722',
                  '#795548',
                  '#9E9E9E',
                  '#607D8B'
                ]
    }
  }

  // Допустим, у вас есть стейт для имени пользователя и пароля
// state = { username: '', password: '', token: '' }

// Функция для регистрации пользователя
signup() {
  const message = JSON.stringify({
    type: 'signup',
    username: this.state.username,
    password: this.state.password
  });
  this.socket.send(message);
}

// Функция для входа пользователя
login() {
  const message = JSON.stringify({
    type: 'login',
    username: this.state.username,
    password: this.state.password
  });
  this.socket.send(message);
}

// Обработка сообщений от сервера
handleServerMessages(event) {
  const data = JSON.parse(event.data);
  switch(data.type) {
    case 'signup':
      if (data.status === 'successful') {
        console.log('Signup successful');
      }
      break;
    case 'login':
      if (data.token) {
        this.setState({ token: data.token });
        console.log('Login successful, token received');
      }
      break;
    case 'error':
      console.error(data.error);
      break;
    default:
      console.log('Unknown message type:', data.type);
  }
}

// При монтировании компонента
componentDidMount() {
  this.socket = new WebSocket(this.state.endpoint);

  this.socket.onopen = () => {
    console.log('Connected to the WebSocket server');
  };

  this.socket.onmessage = this.handleServerMessages.bind(this);

  this.socket.onclose = () => {
    console.log('Disconnected from the WebSocket server');
  };

  this.socket.onerror = (error) => {
    console.error('WebSocket error:', error);
  };
}

// Не забудьте очистить при размонтировании
componentWillUnmount() {  
  this.socket.close();
}


  handleClick() {
    console.log('Clicked');
    const rnd = this.getRandomInt(0, this.state.colors.length);
    const newColor = this.state.colors[rnd];
    this.setState({ rnd, color: newColor });
    this.cc(newColor);
  }

  cc(cd) {
    const message = JSON.stringify({ type: 'cc', color: cd });
    this.socket.send(message);
  }

  userPos(x, y) {
    if (this.lastPose.x !== x || this.lastPose.y !== y) {
      const message = JSON.stringify({ type: 'userPos', x, y });
      this.socket.send(message);
      this.lastPose = { x, y };
    }
  }  

  render() {
    return (

      //<Tetra io={this.socket} onClick={this.handleClick} userPos={this.userPos} usercolor="blue" />
      //<Tetra io={this.socket} onClick={this.handleClick} userPos={this.userPos} usercolor="blue" healpixProps={this.props.healpixProps} isPlay={this.props.isPlay} />
      <GOL className="GOL" 
        io={this.socket} 
        onClick={this.handleClick} 
        healpixProps={this.props.healpixProps} 
        isPlay={this.props.isPlay} 
        isNext={this.props.isNext}
        isPrev={this.props.isPrev}  
        isGenocide={this.props.isGenocide} 
        isCameraRot={this.props.isCameraRot} 
        isPopulate={this.props.isPopulate}  
        isLabeled={this.props.isLabeled} 
        userPos={this.userPos} 
        usercolor="blue" 
      />

    )
  }
}
export default Env;