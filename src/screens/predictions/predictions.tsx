
import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';

import { geFilteredFixturesAction } from '../../reducers/fixtures/fixtures.actions';
import { FixturesFilterModel } from '../../models/fixtures';
import { fixturesSelector, FixturesState } from '../../reducers/fixtures/fixtures.reducer';
import images from '../../assets/images';

const PredictionsScreen: React.FC = () => {
  const {fixtures, isLoadingFixtures } : FixturesState = useSelector(fixturesSelector);
  const navigate = useNavigate();
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [windowHeight, setWindowHeight] = useState(window.innerHeight);

  console.log({fixtures})
  const dispatch: any = useDispatch();
  const fixtureFilters: FixturesFilterModel = new FixturesFilterModel({
    league: 39,
    season: 2020
  })
  
  useEffect(()=>{
    dispatch(geFilteredFixturesAction(fixtureFilters));
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
    <div style={{
      backgroundImage:` url(${images.bgImage})`,
      backgroundRepeat:'no-repeat',
      backgroundSize: 'cover',
      width: windowWidth,
      height: windowHeight,
    }}
    className=" flex flex-grow items-center justify-center"
    >
       <button className=' bg-ui-gold2 rounded p-4 items-center self-center w-80 text-white hover:bg-ui-gold' onClick={handleBetClick}>
          BET
       </button>
    </div>
  );
};

export default PredictionsScreen;
