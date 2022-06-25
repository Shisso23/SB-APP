import { Button } from '@mui/material';
import React, { useEffect, useReducer } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../reducers/root.reducer';
import { geFilteredFixturesAction } from '../../reducers/fixtures/fixtures.actions';
import { getFilteredFixtures } from '../../services/fixtures/index';
import { FixturesFilterModel, FixturesModel } from '../../models/fixtures';
import { fixturesSelector, FixturesState } from '../../reducers/fixtures/fixtures.reducer';


const HomeScreen: React.FC = () => {
  const {fixtures, isLoadingFixtures } : FixturesState = useSelector(fixturesSelector)
  console.log({fixtures})
  const dispatch: any = useDispatch();
  const fixtureFilters: FixturesFilterModel = new FixturesFilterModel({
    league: 39,
    season: 2020
  })
  
  useEffect(()=>{
    dispatch(geFilteredFixturesAction(fixtureFilters));
  }, [])

  
  return (
    <div>

      <p className="text-3xl font-semibold">SB APP</p> 
       <Button ></Button> 
       <div className=" overflow-scroll text-red-700">
          {fixtures?.response.map(fixture=>{
            return <div key={`${fixture.teams.home.id}-${fixture.teams.away.id}`}>-{fixture.teams.away.name}</div>
          })}
      </div>

    </div>
  );
};

export default HomeScreen;
