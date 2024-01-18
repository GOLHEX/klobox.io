// Next button component
import React, { Component, useState } from "react";
import './../tailwind/tailwind.css';
import { random } from "nanoid";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faStepBackward } from "@fortawesome/free-solid-svg-icons";

class Prev extends React.Component {
  constructor(props) {
    super(props);

  }

  handlePrevClick = () => {
    // Вызываем функцию обратного вызова, переданную через пропсы
    this.props.isPrevChange();
  }

  render() {
    // стили и т.д.
    const prevStyle = `prev`;
    return (
      <button onClick={this.handlePrevClick} className={prevStyle}>
        <FontAwesomeIcon icon={faStepBackward} />
      </button>
    );
  }
}

export default Prev;