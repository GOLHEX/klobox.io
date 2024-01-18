// Next button component
import React, { Component, useState } from "react";
import './../tailwind/tailwind.css';
import { random } from "nanoid";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faStepForward } from "@fortawesome/free-solid-svg-icons";

class Next extends React.Component {
  constructor(props) {
    super(props);

  }

  handleNextClick = () => {
    // Вызываем функцию обратного вызова, переданную через пропсы
    this.props.isNextChange();
  }

  render() {
    // стили и т.д.
    const nextStyle = `next`;
    return (
      <button onClick={this.handleNextClick} className={nextStyle}>
        <FontAwesomeIcon icon={faStepForward} />
      </button>
    );
  }
}

export default Next;