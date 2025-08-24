import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Navbar from '../components/navBar';
import HomeScreen from '../screens/home/home.screen';
import BetAndFixturesScreen from '../screens/BetAndFixturesScreen/BetAndFixturesScreen';
import PredictionsScreen from '../screens/predictions/predictions';
import FixturesScreen from '../screens/fixtures/fixtures.screen';

const RootRouter: React.FC = () => {
  return (
  <BrowserRouter>
    <Navbar/>
      <Routes>
          <Route index element={<HomeScreen />} />
          <Route path='/BetAndFixturesScreen' element={<BetAndFixturesScreen />} />
          <Route path='/predictions' element={<PredictionsScreen />} />
          <Route path='/fixtures' element={<FixturesScreen />} />
      </Routes>
  </BrowserRouter>
  );
};

export default RootRouter;
