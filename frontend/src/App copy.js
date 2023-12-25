//frontend\src\three\GameOfLife.js
import React, { Component, useState } from "react"
import Env from "./three/Env"
import W from "./wrapper/W"
//import ThreeScene from "./three/ThreeScene"
import GOL from "./three/GameOfLife"
import Play from "./components/Play"
import Preloader from "./components/Preloader"
import Genocide from "./components/Genocide"
import Populate from "./components/Populate"
import ValueToggleButton from "./components/ValueToggleButton"
import Labels from "./components/Labels"
import './App.css'

class App extends Component (){ 
  constructor(props){
    super(props);
    this.state = {
      healpixProps: {
        radius: 2,
        detail: 1
      },
      isPlay: false,
      isGenocide: false,
      isPopulate: false,
      isLabeled: false,
    }
    //this._playClick = this._playClick.bind(this);
  }
  authenticate(){
    return new Promise(resolve => setTimeout(resolve, 2000))
  }
  componentDidMount(){
    this.authenticate().then(() => {
      const ele = document.getElementById('preloader')
      if(ele){
        // fade out
        ele.classList.add('available')
        setTimeout(() => {
          // remove from DOM
          ele.outerHTML = ''
        }, 200)
      }
    });
  }

  handleDetailChange = (newDetail) => {
    console.log("Значение healpixProps.detail изменилось:", newDetail);
    this.setState(prevState => ({
      healpixProps: {
        ...prevState.healpixProps,
        detail: newDetail,
      },
    }));
  }

  isPlayChange = (newValue) => {
    console.log("Состояние isPlay изменилось:", newValue);
    this.setState(prevState => ({
        ...prevState.isPlay,
        isPlay: newValue,
    }));
  }

  isGenocideChange = () => {
    // Логика очистки поля шестиугольников

    this.setState(prevState => ({
        ...prevState.isGenocide,
        isGenocide: true,
    }));
    console.log('isGenocideChange: ', this.state.isGenocide);
    // Задаем таймаут для возврата isGenocide к false
    // Это гарантирует, что компонент Env сначала обработает true
    setTimeout(() => {
      this.setState({ isGenocide: false });
    }, 0); // Задержка в 0 мс означает, что это будет запланировано как макрозадача после всех текущих микрозадач
  
  }
  isPopulateChange = () => {
    // Логика очистки поля шестиугольников
    
    this.setState(prevState => ({
        ...prevState.isPopulate,
        isPopulate: true,
    }));
    console.log('isPopulateChange: ', this.state.isPopulate);
    // Задаем таймаут для возврата isPopulate к false
    // Это гарантирует, что компонент Env сначала обработает true
    setTimeout(() => {
      this.setState({ isPopulate: false });
    }, 0); // Задержка в 0 мс означает, что это будет запланировано как макрозадача после всех текущих микрозадач
  
  }
  isLabeledChange = (newValue) => {
    console.log("Состояние isLabeled изменилось:", newValue);
    this.setState(prevState => ({
        ...prevState.isLabeled,
        isLabeled: newValue,
    }));
  }
  componentWillUnmount() {

  }
  render() {
    const headerStyle = {
        display: "flex",
        //alignItems: "flex-end",
        alignItems: "center",
        justifyContent: "center"
    };
    return (
      <div className="App">
            <div className="App-header"
            style={headerStyle}
            >
                <Play
                  isPlayChange={this.isPlayChange}
                  isPlayInit={this.state.isPlay}
                />
                <Genocide isGenocideChange={this.isGenocideChange} />
                <Populate isPopulateChange={this.isPopulateChange} />
                <ValueToggleButton
                  initialValue={this.state.healpixProps.detail}
                  minValue={0}
                  maxValue={5}
                  step={1}
                  onValueChange={this.handleDetailChange}
                />
                {/* <Labels 
                  isLabeledInit={this.state.isLabeled}
                  isLabeledChange={this.isLabeledChange}
                /> */}
            </div>
        <Env  healpixProps={this.state.healpixProps} isPlay={this.state.isPlay} isGenocide={this.state.isGenocide} isPopulate={this.state.isPopulate} isLabeled={this.state.isLabeled} />

        <div className="App-footer">
            GNA
        </div>
      </div>
    )
  }
}
export default App;

