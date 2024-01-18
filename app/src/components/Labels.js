//frontend\src\components\Labels.js
import React, { Component } from "react";
import './../tailwind/tailwind.css';

class Labels extends Component {
    constructor(props) {
      super(props);
      this.state = {
        isChecked: this.props.isLabeledInit || false 
      };
    }

    isLabeledClick = () => {
      const newValue = !this.state.isChecked;
      this.setState({ isChecked: newValue }, () => {
        // После обновления локального состояния, вызываем функцию обратного вызова с новым значением
        this.props.isLabeledChange(newValue);
      });
    };

  render() {
    const { isChecked } = this.state;

    return (
      <div>
        <label className="switch">
          <input
            type="checkbox"
            checked={isChecked}
            onChange={this.isLabeledClick}
          />
          <span className="slider round"></span>
        </label>
      </div>
    );
  }
}

export default Labels;
