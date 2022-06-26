import React, { ChangeEvent, MouseEventHandler, useEffect, useState, useRef, ChangeEventHandler } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import CheckBoxIcon from '@mui/material/Checkbox';

import { geFilteredLeaguesAction } from '../../reducers/leagues/leagues.actions';
import images from '../../assets/images';
import { leaguesSelector, LeaguesState } from '../../reducers/leagues/leagues.reducer';
import { LeagueDataLeagueModel, LeaguesFilterModel } from '../../models/leagues';
import { CircularProgress } from '@mui/material';






const BetScreen: React.FC = () => {
  const {leagues, isLoadingLeagues } : LeaguesState = useSelector(leaguesSelector);
  const navigate = useNavigate();
  const checkBoxRef = useRef(null);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [windowHeight, setWindowHeight] = useState(window.innerHeight);
  const [selectedLeagues, setSelectedLeagues] = useState<LeagueDataLeagueModel[]>();
  const [leaguesFilters, setLeaguesFilters] = useState<LeaguesFilterModel>({current: true, season: 2022, type: 'league'});

  const dispatch: any = useDispatch();
  
  useEffect(()=>{
    dispatch( geFilteredLeaguesAction (leaguesFilters));
    window.addEventListener('resize', updateWindowDimensions)
    return ()=>{
      window.removeEventListener('resize', updateWindowDimensions)
    }
  }, []);

const updateWindowDimensions =()=>{
  setWindowHeight(window.innerHeight);
  setWindowWidth(window.innerWidth);
}

useEffect(()=>{
    console.log({selectedLeagues})
}, [selectedLeagues, selectedLeagues?.length])

const handleNextClick =()=>{
  return navigate('/predictions', {})
}

const handleLeagueSelect =(e:ChangeEvent<HTMLInputElement>, league: LeagueDataLeagueModel)=>{
    if(e.target.checked){
        if(selectedLeagues){
            if(selectedLeagues.every(leagueSelected => leagueSelected.id !== league.id)){
                setSelectedLeagues([...selectedLeagues, league])
            }
        }
        else{
            setSelectedLeagues([league])
        }
    }else{
        if(selectedLeagues && selectedLeagues.some(leagueSelected => leagueSelected.id === league.id)){
            setSelectedLeagues(selectedLeagues.filter(leagueSelected=> leagueSelected.id !== league.id))
        }
    }
 
}

  return (
    <div style={{
      backgroundImage:` url(${images.bgImage})`,
      backgroundRepeat:'no-repeat',
      backgroundSize: 'cover',
      width: windowWidth,
      height: windowHeight,
    }}
    className=" flex flex-grow justify-center items-center flex-col pb-10 pt-28"
    >
        {
            isLoadingLeagues? <CircularProgress />:
           <> <div className=' flex font-bold text-lg py-2 bg-white h-14 w-1/5 mb-5 items-center justify-center'>Select leagues for which to predict</div>
        
        <div className=' flex flex-col w-9/12 overflow-y-scroll items-center'>
        <div className=' text-white flex w-4/6 '>{selectedLeagues?.length || 0} Selected</div>
            {leagues?.response.map(leagueData=>{
                return (<div key={`${leagueData.league.id}`} className=' flex flex-row justify-between py-6 my-2 px-3 w-4/6 rounded-md bg-blue-300 hover:bg-blue-200'>
                    <CheckBoxIcon ref={checkBoxRef} onChange={(e)=> handleLeagueSelect(e, leagueData.league)} size="medium"/>
                    <div className=' flex text-lg font-semibold items-center justify-center text-black'>{leagueData.league.name}</div>
                    <div className=' flex flex-row'>
                        <div className=' px-2 text-lg text-black'>{ leagueData.country.name}</div>
                        <div>
                            <img src={`${leagueData.country.flag}`} alt='country flag' width={40} height={40}/>
                        </div>
                    </div>
                </div>)
            })}
        </div>
        <button disabled={!selectedLeagues || selectedLeagues?.length ===0} style={{backgroundColor:!selectedLeagues|| selectedLeagues?.length ===0? 'gray': 'rgb(96 165 250)'}} className=' flex bg-blue-400 rounded p-4 items-center justify-center self-end w-60 text-black hover:bg-blue-200 mr-5' onClick={handleNextClick}>
          Next
       </button></>
        }
        
    </div>
  );
};

export default BetScreen;
