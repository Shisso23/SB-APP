import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Navbar from '../components/navBar';
import HomeScreen from '../screens/home/home.screen';
import BetAndFixturesScreen from '../screens/BetAndFixturesScreen/BetAndFixturesScreen';
import PredictionsScreen from '../screens/predictions/predictions';
import FixturesScreen from '../screens/fixtures/fixtures.screen';
import AccessPassesScreen from '../screens/access/AccessPassesScreen';
import PayFastRedirectScreen from '../screens/access/PayFastRedirectScreen';
import PayFastResultScreen from '../screens/access/PayFastResultScreen';
import OfficialHistoryScreen from '../screens/official/OfficialHistoryScreen';
import AdminScreen from '../screens/admin/AdminScreen';

const RootRouter: React.FC = () => {
  return (
  <BrowserRouter>
    <Navbar/>
      <Routes>
          <Route index element={<HomeScreen />} />
          <Route path='/BetAndFixturesScreen' element={<BetAndFixturesScreen />} />
          <Route path='/predictions' element={<PredictionsScreen />} />
          <Route path='/fixtures' element={<FixturesScreen />} />
          {/*
            Access passes. `/access/result` is the target the backend's PayFast
            return/cancel redirect points at; it only ever reads entitlement
            from the server before showing access as active.
          */}
          <Route path='/access' element={<AccessPassesScreen />} />
          <Route path='/access/checkout' element={<PayFastRedirectScreen />} />
          <Route path='/access/result' element={<PayFastResultScreen />} />
          {/*
            Public history. Needs no sign-in: it serves only published records
            and a fixed daily preview, all decided server-side.
          */}
          <Route path='/history' element={<OfficialHistoryScreen />} />
          {/*
            Admin workflow. The server refuses every endpoint behind this route
            to a non-staff user; hiding the link is only courtesy.
          */}
          <Route path='/admin' element={<AdminScreen />} />
      </Routes>
  </BrowserRouter>
  );
};

export default RootRouter;
