import React, { Component } from 'react';
import Env from '../../three/Env.js';
import Play from '../Play.js';
import Next from '../Next.js';
import Prev from '../Prev.js';
import Genocide from '../Genocide.js';
import Populate from '../Populate.js';
import CameraRot from '../CameraRot.js';
import ValueToggleButton from '../ValueToggleButton.js';
import Labels from '../Labels.js';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlay, faForward, faBackward, faVolumeUp, faVolumeDown, faPause } from '@fortawesome/free-solid-svg-icons';
import './GamePage.css';

class GamePage extends Component {
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
        };
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
    return (
      <div className="bg-gray-200 min-h-screen relative">
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
        <div className="controls-container">
          {/* Контейнер для ValueToggleButton и его метки */}
          <div className="value-toggle-container">
            <ValueToggleButton
              initialValue={this.state.healpixProps.detail}
              minValue={0}
              maxValue={55}
              step={1}
              onValueChange={this.handleDetailChange}
            />
          <div className="value-toggle-label">Repeat</div>
          </div>
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
          <Genocide 
            isGenocideChange={this.isGenocideChange}
          />
          <Populate 
            isPopulateChange={this.isPopulateChange}
          />
          <CameraRot 
            isCameraRotChange={this.isCameraRotChange}
          />
        </div>
      </div>
    );
  }
}

export default GamePage;
//   render() {
//     return (
//         <div className="bg-gray-200 min-h-screen relative">
//             <div className="flex-grow relative z-2">
//                 <Env
//                     healpixProps={this.state.healpixProps}
//                     isPlay={this.state.isPlay}
//                     isNext={this.state.isNext}
//                     isPrev={this.state.isPrev}
//                     isGenocide={this.state.isGenocide}
//                     isCameraRot={this.state.isCameraRot}
//                     isPopulate={this.state.isPopulate}
//                     isLabeled={this.state.isLabeled}
//                 />
//             </div>
//             {/* Кнопки поверх всего */}
//             <div className="absolute top-0 left-0 w-full h-full z-1">
//                     <Prev
//                         isPrevChange={this.isPrevChange}
//                         isPrevInit={this.state.isPrev}
//                         className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
//                     />
//                     <Play
//                         isPlayChange={this.isPlayChange}
//                         isPlayInit={this.state.isPlay}
//                         className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
//                     />
//                     <Next 
//                         isNextChange={this.isNextChange}
//                         isNextInit={this.state.isNext} 
//                         className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
//                     />
//                     <Genocide
//                         isGenocideChange={this.isGenocideChange}
//                         className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
//                     />
//                     <Populate
//                         isPopulateChange={this.isPopulateChange}
//                         className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
//                     />
//                     <ValueToggleButton
//                         initialValue={this.state.healpixProps.detail}
//                         minValue={0}
//                         maxValue={55}
//                         step={1}
//                         onValueChange={this.handleDetailChange}
//                         className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
//                     />
//                 <CameraRot
//                     isCameraRotChange={this.isCameraRotChange}
//                     className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
//                 />
//                 {/* Другие кнопки, если есть */}
//             </div>
//         </div>
//     );
// }
// }

// export default GamePage;