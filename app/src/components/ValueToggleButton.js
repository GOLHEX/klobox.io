import React, { Component, useState } from "react"

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
      <div>
        <button onClick={this.handleDecreaseClick}>-</button>
        <span>{this.state.value}</span>
        <button onClick={this.handleIncreaseClick}>+</button>
      </div>
    );
  }
}

export default ValueToggleButton;
