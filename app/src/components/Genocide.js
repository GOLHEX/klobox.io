// Genocide button component
import React, { Component, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGhost } from '@fortawesome/free-solid-svg-icons';
import './../tailwind/tailwind.css';
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
    const genocideStyle = `genocide`;
    return (
      <button onClick={this.handleGenocideClick} className={genocideStyle}>
        <FontAwesomeIcon icon={faGhost} />
      </button>
    );
  }
}

export default Genocide;