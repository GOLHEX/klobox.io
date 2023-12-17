// Genocide button component
import React, { Component, useState } from "react";
import './Genocide.css';
import { random } from "nanoid";

class Genocide extends React.Component {
  constructor(props) {
    super(props);

  }

  handleGenocideClick = () => {
    // Вызываем функцию обратного вызова, переданную через пропсы
    this.props.isGenocideChange();
  }

  render() {
    // стили и т.д.
    const genocideStyle = `genocide-button`;
    return (
      <button onClick={this.handleGenocideClick} className={genocideStyle}>
        Genocide
      </button>
    );
  }
}

export default Genocide;