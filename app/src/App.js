import React, { Component, Suspense, lazy } from "react";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import W from "./wrapper/W.js";
import Preloader from "./components/Preloader.js";
//import NotFoundPage from "./components/twcssui/NotFoundPage.js";
import './tailwind/tailwind.css';

// Ленивая загрузка страниц, можно также использовать для Preloader
const HomePage = lazy(() => import('./components/twcssui/HomePage.js'));
const LoginPage = lazy(() => import('./components/twcssui/LoginPage.js'));
const SignUpPage = lazy(() => import('./components/twcssui/SignUpPage.js'));
const ProfilePage = lazy(() => import('./components/twcssui/ProfilePage.js'));
const GamePage = lazy(() => import('./components/twcssui/GamePage.js'));
const NotFoundPage = lazy(() => import('./components/twcssui/NotFoundPage.js'));  

class App extends Component {
  constructor(props){
    super(props);
    this.state = {
      isLoading: true, // Добавлено состояние для прелоадера
    };
  }

  authenticate(){
    return new Promise(resolve => setTimeout(resolve, 1618));
  }

  componentDidMount(){
    this.authenticate().then(() => {
      this.setState({ isLoading: false }); // Убрать прелоадер после аутентификации
    });
  }
    render() {
      // Если приложение все еще загружается, показать прелоадер
      if (this.state.isLoading) {
        return <Preloader />;
      }
  
    return (
      <W>
      <Router>
        <Suspense fallback={<Preloader />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignUpPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/game" element={<GamePage />} />
            {/* Другие маршруты */}
            <Route path="*" element={<NotFoundPage />} /> {/* Обработка 404 */}
            {/* Можно добавить дополнительные маршруты для других ошибок, если необходимо */}
          </Routes>
        </Suspense>
        {/* Здесь можно добавить компоненты, которые должны отображаться всегда, например навигационное меню */}
      </Router>
      </W>
    );
  }
}

export default App;