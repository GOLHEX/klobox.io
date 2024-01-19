// Pop[ulate] button component
import React, { Component, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDice } from '@fortawesome/free-solid-svg-icons';
import './../tailwind/tailwind.css';

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
    const populateStyle = `populate`;
    return (
      <button onClick={this.handlePopulateClick} className={populateStyle}>
        <FontAwesomeIcon icon={faDice} />
      </button>
    );
  }
}

export default Populate;