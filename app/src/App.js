import React, { Component } from "react";
import Env from "./three/Env";
import W from "./wrapper/W";
import GOL from "./three/GameOfLife";
import UserProfile from "./components/UserProfile";
import Play from "./components/Play";
import Preloader from "./components/Preloader"; // Убедитесь, что импортирован правильно
import Next from "./components/Next";
import Prev from "./components/Prev";
import Genocide from "./components/Genocide";
import Populate from "./components/Populate";
import ValueToggleButton from "./components/ValueToggleButton";
import Labels from "./components/Labels";
import CameraRot from "./components/CameraRot";
import './App.css';


class App extends Component {
  constructor(props){
    super(props);
    this.state = {
      healpixProps: {
        radius: 2,
        detail: 6
      },
      isPlay: false,
      isNext: false,
      isPrev: false,
      isGenocide: false,
      isPopulate: false,
      isLabeled: false,
      isCameraRot: false,
      isLoading: true, // Добавлено состояние для прелоадера
    };
  }

  authenticate(){
    return new Promise(resolve => setTimeout(resolve, 3000));
  }

  componentDidMount(){
    this.authenticate().then(() => {
      this.setState({ isLoading: false }); // Убрать прелоадер после аутентификации
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

  isNextChange = () => {
    // Логика нажатия кнопки Next
    this.setState(prevState => ({
        ...prevState.isNext,
        isNext: true,
    }));

    console.log('isNextChange: ', this.state.isNext);
    // Задаем таймаут для возврата isNext к false
    // Это гарантирует, что компонент Env сначала обработает true
    setTimeout(() => {
      this.setState({ isNext: false });
    }, 0); // Задержка в 0 мс означает, что это будет запланировано как макрозадача после всех текущих микрозадач

  }

  isPrevChange = () => {
    // Логика нажатия кнопки Prev
    this.setState(prevState => ({
        ...prevState.isPrev,
        isPrev: true,
    }));
    console.log('isPrevChange: ', this.state.isPrev);
    // Задаем таймаут для возврата isPrev к false
    // Это гарантирует, что компонент Env сначала обработает true
    setTimeout(() => {
      this.setState({ isPrev: false });
    }, 0); // Задержка в 0 мс означает, что это будет запланировано как макрозадача после всех текущих микрозадач

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

  isCameraRotChange = () => {
    // Логика нажатия кнопки поворота камеры
    this.setState(prevState => ({
        ...prevState.isCameraRot,
        isCameraRot: true,
    }));
    console.log('isCameraRotChange: ', this.state.isCameraRot);
    // Задаем таймаут для возврата isCamearaRot к false
    // Это гарантирует, что компонент Env сначала обработает true
    setTimeout(() => {
      this.setState({ isCameraRot: false });
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

  render() {
    const { isLoading } = this.state;
    const headerStyle = {
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
    };

    // Если приложение все еще загружается, показать прелоадер
    if (isLoading) {
      return <Preloader />;
    }

    // Основной интерфейс приложения отображается, когда isLoading === false
    return (
      <div className="App">
        <div className="App-header" style={headerStyle}>
        <Prev
          isPrevChange={this.isPrevChange}
          isPrevInit={this.state.isPrev}
        />
        <Play
          isPlayChange={this.isPlayChange}
          isPlayInit={this.state.isPlay}
        />
        <Next 
          isNextChange={this.isNextChange}
          isNextInit={this.state.isNext} 
        />
        <Genocide isGenocideChange={this.isGenocideChange} />
        <Populate isPopulateChange={this.isPopulateChange} />
        <ValueToggleButton
          initialValue={this.state.healpixProps.detail}
          minValue={0}
          maxValue={55}
          step={1}
          onValueChange={this.handleDetailChange}
        />
        <Labels 
          isLabeledInit={this.state.isLabeled}
          isLabeledChange={this.isLabeledChange}
        /> 
        <UserProfile />
        </div>
        <CameraRot isCameraRotChange={this.isCameraRotChange} />
        <Env
          healpixProps={this.state.healpixProps}
          isPlay={this.state.isPlay}
          isNext={this.state.isNext}
          isPrev={this.state.isPrev}
          isGenocide={this.state.isGenocide}
          isCameraRot={this.state.isCameraRot}
          isPopulate={this.state.isPopulate}
          isLabeled={this.state.isLabeled}
        />
        <div className="App-footer">
          GNA
        </div>
      </div>
    );
  }
}

export default App;
