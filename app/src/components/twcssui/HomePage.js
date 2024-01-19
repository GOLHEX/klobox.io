import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSnowflake } from '@fortawesome/free-solid-svg-icons';
import Hello from '../../components/Hello.js';
import '../../tailwind/tailwind.css';
import './HomePage.css';


function HomePage() {
  const navigate = useNavigate();

  const handlePlay = () => {
    // Redirect the user to the game or lobby page
    navigate('/game'); // Change the path according to your routing settings
  };

  return (
    <>
      <div className="button" onClick={handlePlay}>
        <div className="box">K</div>
        <div className="box">L</div>
        <div className="box">O</div>
        <div className="box">B</div>
        <div className="box">O</div>
        <div className="box">X</div>
      </div>
    </>
  );
}
// Remove the line below as it seems to be incomplete or unnecessary
export default HomePage;