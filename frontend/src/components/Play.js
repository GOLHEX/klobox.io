import React, { Component } from "react";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlay } from '@fortawesome/free-solid-svg-icons';
import './Play.css';

class Play extends Component {
  constructor(props) {
    super(props);
    this.state = { isPlay: this.props.isPlayInit || false };
  }

  isPlayClick = () => {
    const newValue = !this.state.isPlay;
    this.setState({ isPlay: newValue }, () => {
      // После обновления локального состояния, вызываем функцию обратного вызова с новым значением
      this.props.isPlayChange(newValue);
    });
  }

  
  render() {
    const playStyle = `play ${!this.state.isPlay ? '' : 'inactive'}`;
    return (
      <button onClick={this.isPlayClick} className={playStyle}>
        {this.state.isPlay ? 'STOP ■' : 'PLAY ►'}
      </button>
    );
  }
}

export default Play;
