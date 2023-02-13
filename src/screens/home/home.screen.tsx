import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import images from '../../assets/images';

const HomeScreen: React.FC = () => {
  const navigate = useNavigate();
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [windowHeight, setWindowHeight] = useState(window.innerHeight);
  
  useEffect(()=>{
    window.addEventListener('resize', updateWindowDimensions)
    return ()=>{
      window.removeEventListener('resize', updateWindowDimensions)
    }
  }, []);

const updateWindowDimensions =()=>{
  setWindowHeight(window.innerHeight);
  setWindowWidth(window.innerWidth);
}

const handleBetClick =()=>{
  return navigate('/bet', {})
}

  return (
    <div className="text-center p-20 bg-gray-900 min-h-screen">
      <h1 className="flex-row text-lg sm:text-3xl p-20 text-teal-600 font-medium">Score big with our soccer betting predictions</h1>
    <div className=" flex flex-grow items-center justify-center">
       <button className="rounded p-4 items-center self-center w-40 sm:w-80 text-white bg-gradient-to-r from-cyan-500 to-teal-500 justify-center hover:bg-blue-200" onClick={handleBetClick}>
          START
       </button>
    </div>
    </div>
  );
};

export default HomeScreen;
