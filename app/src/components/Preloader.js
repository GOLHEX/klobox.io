import React, { useState, useEffect } from 'react';
import './Preloader.css'; // Убедитесь, что путь к CSS файлу указан верно

const Preloader = () => {
  const [loadingProgress, setLoadingProgress] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setLoadingProgress(prevProgress => {
        const nextProgress = prevProgress >= 100 ? 0 : prevProgress + 1;
        return nextProgress;
      });
    }, 25);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="preloader-container">
      <div className="preloader-battery">
        <div 
          className="cssload-liquid" 
        ></div>
      </div>
    </div>
  );
};

export default Preloader;
