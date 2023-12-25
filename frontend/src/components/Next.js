// Next button component
import React, { Component, useState } from "react";
import './Next.css';
import { random } from "nanoid";

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
    const nextStyle = `next-button`;
    return (
      <button onClick={this.handleNextClick} className={nextStyle}>
        Next
      </button>
    );
  }
}

export default Next;