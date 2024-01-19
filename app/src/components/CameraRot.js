// Genocide button component
import React, { Component, useState } from "react";
import './../tailwind/tailwind.css';
import { random } from "nanoid";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCamera } from '@fortawesome/free-solid-svg-icons';

class CameraRot extends React.Component {
  constructor(props) {
    super(props);
  }

  handleCameraRotClick = () => {
    // Вызываем функцию обратного вызова, переданную через пропсы
    this.props.isCameraRotChange();
  }

  render() {
    // стили и т.д.
    const cameraStyle = `camera-button`;
    return (
      <button onClick={this.handleCameraRotClick} className={cameraStyle}>
        <FontAwesomeIcon icon={faCamera} />
      </button>
    );
  }
}

export default CameraRot;