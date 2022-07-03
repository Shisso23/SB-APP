/* eslint-disable react-hooks/exhaustive-deps */

import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useLocation } from 'react-router-dom';
import { Autocomplete, CircularProgress, TextField } from '@mui/material';
import moment from 'moment';
import DatePicker from 'react-datepicker'
import "react-date-range/dist/styles.css";
import "react-date-range/dist/theme/default.css";
import "react-datepicker/dist/react-datepicker.css";

import { geFilteredFixturesAction } from '../../reducers/fixtures/fixtures.actions';
import { FixturesFilterModel, FixturesModel } from '../../models/fixtures';
import { fixturesSelector, FixturesState } from '../../reducers/fixtures/fixtures.reducer';
import images from '../../assets/images';
import { LeagueDataLeagueModel } from '../../models/leagues';
import { getFilteredFixtures } from '../../services/fixtures/index';
import { FixtureDataModel } from '../../models/fixtures/index';
import { currentDate, toMomentDate } from '../../helpers/dateTimeHelper';



const FixturesScreen: React.FC = () => {
type LocationState = {
    selectedLeagues: {selectedLeagues: LeagueDataLeagueModel[]};
    selectedBetOptions: {name: String; id: Number}[]
}
  const {fixtures, isLoadingFixtures } : FixturesState = useSelector(fixturesSelector);
  const navigate = useNavigate();
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [windowHeight, setWindowHeight] = useState(window.innerHeight);
  const [fromDate, setFromDate] = useState(new Date());
  const [loadingLeaguesFixtures, setLoadingLeaguesFixtures] = useState(false);
  const [toDate, setToDate] = useState( new Date(moment().add(1,'days').format('YYYY-MM-DD')));
  const location = useLocation();
  const dispatch: any = useDispatch();
  const selectedBetOptions  =  location.state
  const {selectedLeagues} =  location.state as LocationState;
  const [futureFixtures, setFutureFixtures] = useState<FixtureDataModel[]>([]);
  const [allFixtures, setAllFixtures]= useState<FixtureDataModel[]>();
  const [currentFixtures, setCurrentFixtures] = useState<FixtureDataModel[]>();
  const fixtureFilters: FixturesFilterModel = new FixturesFilterModel({
    league: 39,
    season: 2020
  });


  const [selectedOptions, setSelectedOptions] = useState<{name: String; id: Number}[] | []>([]);
  const betOptions: {name: String; id: Number} [] = [{name: 'Both Teams to Score', id: 0}, {name: 'Home/Away', id: 1}, {name: 'Home/Away over 1.5', id: 2},
    {name: 'over 1.5', id: 3}, {name: 'Over 2.5', id: 4}, {name: 'Home/Away Wins Either Half', id: 5 }, {name: 'Multi Goals (2-5) Goals', id: 6}, {name: 'Multi Goals (3-6) Goals', id: 7},
    {name: 'Both Halfs Over 0.5', id: 8}, {name: 'Draw or GG', id: 9 }, {name: 'Draw', id: 10}, {name: 'Half-Time Draw', id: 11}
  ]
  const minFixtureDate = new Date();

  useEffect(()=>{
    dispatch(geFilteredFixturesAction(fixtureFilters));
    window.addEventListener('resize', updateWindowDimensions)
    getLeaguesSeasonsFixtures().then(responses=>{
        setAllFixtures(responses.flat())
        setFutureFixtures(filterFutureFixtures(responses.flat()))
    }).finally(()=>{
      setLoadingLeaguesFixtures(false);
    })
    return ()=>{
      window.removeEventListener('resize', updateWindowDimensions)
    }
  }, []);

  useEffect(()=>{
   setCurrentFixtures(filterFixtresBetweenDates(fromDate, toDate));
  }, [futureFixtures.length])

  useEffect(()=>{
    setCurrentFixtures(filterFixtresBetweenDates(fromDate, toDate));
  }, [fromDate.toString(), toDate.toString()])

  const filterFutureFixtures=(fixtures:FixtureDataModel[] )=>{
    return fixtures.filter(fixtureData=> {
      return toMomentDate(fixtureData.fixture.date).isSameOrAfter(currentDate)
    })
  }

  const filterFixtresBetweenDates = (from: Date, to: Date)=>{
    const fixtures = futureFixtures.filter(fixtureData=>{
      return toMomentDate(fixtureData.fixture.date).isSameOrAfter(moment(from)) && toMomentDate(fixtureData.fixture.date).isSameOrBefore(moment(to))
    })
    return fixtures
  }

  const getLeaguesSeasonsFixtures = async ()=>{
    setLoadingLeaguesFixtures(true);
    return Promise.all(
        selectedLeagues.selectedLeagues.map(async (league: LeagueDataLeagueModel, index) => {
        const seasons = [2022, 2021, 2020]; //Get from date pickers
       return Promise.all(seasons.map(async (season: Number)=>{
            const getLeagueFixturesResponse: FixturesModel =  await (await getFilteredFixtures(new FixturesFilterModel({league: league.id, season}))).data
            return getLeagueFixturesResponse.response;
        })).then(response=>{
            return response.flat()
        })
        }),
      );
  }

  const handleNextClick =async ()=>{
    // console.log({H2HFixtures: getH2HFixtures(44, 33)})
  }
  const getLastFiveFixtures = (teamId: Number)=>{
    return allFixtures.filter(fixture=>{
      return fixture.teams.home.id === teamId || fixture.teams.away.id === teamId
    })
  }
  
  const getH2HFixtures =(teamOneId: Number, teamTwoId: Number)=>{
      return allFixtures.filter(fixture=>{
          return ((fixture.teams.home.id === teamOneId || fixture.teams.away.id === teamOneId) &&
          (fixture.teams.home.id === teamTwoId || fixture.teams.away.id === teamTwoId)) && fixture.fixture.status.short ==='FT'
      })
  }

const updateWindowDimensions =()=>{
  setWindowHeight(window.innerHeight);
  setWindowWidth(window.innerWidth);
}
  return (
    <div style={{
      backgroundImage:` url(${images.bgImage})`,
      backgroundRepeat:'no-repeat',
      backgroundSize: 'cover',
      width: windowWidth,
      height: windowHeight,
    }}
    className=" flex flex-grow items-center flex-col justify-center pb-10 pt-28"
    >
        <div className=' flex flex-col absolute z-50 float-right top-24  right-10 flex-grow'> 
            <div className=' text-white font-semibold'>
                Bet Options
            </div>
                <Autocomplete
                    className='bg-gray-200 w-64 rounded-lg'
                    multiple
                    defaultValue={[]}
                    value={selectedOptions}
                    id="Bet Options"
                    getOptionLabel={(option: {name: String; id: Number})=> `${option.name}`}
                    options={betOptions.map((option) =>  option)}
                    onChange={(event, value: {name: String; id: Number}[])=>{
                        setSelectedOptions(value)
                    }}
                    renderInput={(params) => <TextField {...params} InputLabelProps={{color: 'primary', inputMode: 'search' }} />}
              />
              <div className=' mt-5  h-5/6'>
                <div className=' text-white font-semibold '>
                    Fixtures dates
                    <div className=' flex flex-col justify-between w-full flex-grow  text-white text-base font-normal '>
                        <span className=' mb-1'>
                            From:
                        </span>
                        <div>
                            <DatePicker className=' text-black' minDate={minFixtureDate} selected={fromDate} onChange={(date:Date) => setFromDate(date)} />
                        </div>
                        <span className=' my-1'>
                            To:
                        </span>
                        <div className=' w-1/2 '> 
                            <DatePicker className=' text-black' minDate={new Date()} selected={toDate} onChange={(date:Date) => setToDate(date)} />
                        </div>
                    </div> 
                  </div>
              </div>
        </div>
        <div className=' flex flex-row  w-full justify-center'>
          <div className=' flex font-bold self-center text-lg py-2 bg-white h-14 w-64 mb-5 items-center justify-center text-center'>Predictions</div>
        </div>
  
            <>
              {loadingLeaguesFixtures? <CircularProgress/> : <div className='flex flex-col w-9/12 overflow-y-scroll items-center'>
                  {currentFixtures?.map(fixtureData=>{
                      return (
                      <div key={`${fixtureData.fixture.id}`} className=' flex flex-row justify-between py-6 my-2 px-3 w-4/6 rounded-md bg-blue-300 hover:bg-blue-200'>
                          <div>{fixtureData.league.name}
                              <div>
                                {
                                  `${toMomentDate(fixtureData.fixture.date).format('DD-MMMM-YYYY')}`
                                }
                              </div>
                          </div>
                          <div className=' flex flex-row justify-between w-3/6'>
                              <div className=' flex flex-row'>
                                  <img src={`${fixtureData.teams.home.logo}`} alt='country flag' width={40} height={40} className=' mr-1'/>
                                  <div className=' flex text-lg font-semibold items-center justify-center text-black'>{fixtureData.teams.home.name}</div>
                              </div>
                              <div className=' flex justify-start w-1/3'>
                                  <div className=' flex flex-row float-left'>
                                      <img src={`${fixtureData.teams.away.logo}`} alt='country flag' width={40} height={40} className=' mr-1'/>
                                      <div className=' flex text-lg font-semibold items-center justify-center text-black'>{fixtureData.teams.away.name}</div>
                                  </div>
                              </div>
                          </div>
                          <div className=' flex flex-row justify-center items-center'>
                              <p>{`${fixtureData.goals.home}-${fixtureData.goals.away}`}</p>
                          </div>
                      </div>)
                  })}
              </div>}
            </>
            <button className=' flex bg-blue-400 rounded p-4 items-center justify-center self-end w-60 text-black hover:bg-blue-200 mr-5' onClick={handleNextClick}>
                Next
            </button>
        </div>
  );
};

export default FixturesScreen;
