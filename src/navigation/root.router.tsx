import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Navbar from '../components/navBar';
import HomeScreen from '../screens/home/home.screen';
import BetScreen from '../screens/bet/bet';
import PredictionsScreen from '../screens/predictions/predictions';
import FixturesScreen from '../screens/fixtures/fixtures.screen';

const RootRouter: React.FC = () => {
  return (
  <BrowserRouter>
    <Navbar fixed={true}/>
      <Routes>
          <Route index element={<HomeScreen />} />
          <Route path='/bEt' element={<BetScreen />} />
          <Route path='/predictions' element={<PredictionsScreen />} />
          <Route path='/fixtures' element={<FixturesScreen />} />
      </Routes>
  </BrowserRouter>
  );
};

export default RootRouter;
