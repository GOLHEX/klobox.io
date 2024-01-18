import React from 'react';
import { useNavigate } from 'react-router-dom';
import '../../tailwind/tailwind.css';
import './HomePage.css';


function HomePage() {
  const navigate = useNavigate();

  const handlePlay = () => {
    // Перенаправление пользователя на страницу игры или лобби
    navigate('/game'); // Измените путь в соответствии с вашими настройками маршрутизации
  };

  return (
    <div className="body">
          <div class="center">
            <div class="hexagon" onClick={handlePlay}></div>
          </div>
    </div>
  );
}

export default HomePage;

