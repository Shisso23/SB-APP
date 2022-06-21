import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import HomeScreen from '../screens/home/home.screen';

const RootRouter: React.FC = () => {
  return (
  <BrowserRouter>
      <Routes>
          <Route index element={<HomeScreen />} />
      </Routes>
  </BrowserRouter>
  );
};

export default RootRouter;
