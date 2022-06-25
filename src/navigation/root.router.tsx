import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Navbar from '../components/navBar';
import HomeScreen from '../screens/home/home.screen';
import BetScreen from '../screens/bet/bet';
import PredictionsScreen from '../screens/predictions/predictions';

const RootRouter: React.FC = () => {
  return (
  <BrowserRouter>
    <Navbar fixed={true}/>
      <Routes>
          <Route index element={<HomeScreen />} />
          <Route path='/bet' element={<BetScreen />} />
          <Route path='/predictions' element={<PredictionsScreen />} />
      </Routes>
  </BrowserRouter>
  );
};

export default RootRouter;
