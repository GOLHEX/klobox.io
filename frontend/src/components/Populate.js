// Pop[ulate] button component
import React, { Component, useState } from "react";
import './Populate.css';
import { random } from "nanoid";

class Populate extends React.Component {
  constructor(props) {
    super(props);

  }

  handlePopulateClick = () => {
    // Вызываем функцию обратного вызова, переданную через пропсы
    this.props.isPopulateChange();
  }

  render() {
    // стили и т.д.
    const populateStyle = `genocide-button`;
    return (
      <button onClick={this.handlePopulateClick} className={populateStyle}>
        Populate
      </button>
    );
  }
}

export default Populate;