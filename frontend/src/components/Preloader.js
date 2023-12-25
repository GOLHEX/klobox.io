import React, { useState, useEffect } from 'react';
import './Preloader.css';

const Preloader = () => {
  const [loadingProgress, setLoadingProgress] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setLoadingProgress(prev => {
        const next = prev + 1;
        if (next >= 100) {
          clearInterval(interval);
          return 100;
        }
        return next;
      });
    }, 30);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="preloader">
      {/* Элемент для теней */}
      <span className="loading-text-shadow">
        {loadingProgress}%
      </span>
      {/* Элемент с заливкой */}
      <span
        className="loading-text"
        style={{
          backgroundSize: `100% ${loadingProgress}%`
        }}
      >
        {loadingProgress}%
      </span>
    </div>
  );
};

export default Preloader;
