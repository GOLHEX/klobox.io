import React, { Component, useState } from "react"
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faMinus } from '@fortawesome/free-solid-svg-icons';
import './../tailwind/tailwind.css';
import './ValueToggleButton.css';

class ValueToggleButton extends Component {
  constructor(props) {
    super(props);
    this.state = {
      value: this.props.initialValue || 1,
    };
  }

  handleIncreaseClick = () => {
    if (this.state.value < this.props.maxValue) {
      this.setState(prevState => {
        const newValue = prevState.value + this.props.step;
        this.props.onValueChange(newValue); // Вызываем функцию обратного вызова
        return { value: newValue };
      });
    }
  };

  handleDecreaseClick = () => {
    if (this.state.value > this.props.minValue) {
      this.setState(prevState => {
        const newValue = prevState.value - this.props.step;
        this.props.onValueChange(newValue); // Вызываем функцию обратного вызова
        return { value: newValue };
      });
    }
  };

  render() {
    return (
      <div className="value-toggle-container">
        <button onClick={this.handleDecreaseClick} className="control-button">
          <FontAwesomeIcon icon={faMinus} className="control-icon" />
        </button>
        <div className="value-display">{this.state.value}</div>
        <button onClick={this.handleIncreaseClick} className="control-button">
          <FontAwesomeIcon icon={faPlus} className="control-icon" />
        </button>
      </div>
    );
  }
}

export default ValueToggleButton;
