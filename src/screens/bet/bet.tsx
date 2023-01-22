import React, { useEffect, useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { useNavigate } from 'react-router-dom'

import './styles.css'
import { geFilteredLeaguesAction } from '../../reducers/leagues/leagues.actions'
import images from '../../assets/images'
import {
  leaguesSelector,
  LeaguesState,
} from '../../reducers/leagues/leagues.reducer'
import { CircularProgress, TextField } from '@mui/material'
import Autocomplete from '@mui/material/Autocomplete'
import { LeagueDataModel, LeaguesFilterModel } from '../../models/leagues/index'
import { getStandingsByLeagueId } from '../../services/standings'
import { seasonsBack } from '../../variables/variables'
import { StandingsModel } from '../../models/standings-models'
import { favLeaguesMock, MockLeaguesStandings } from '../../mock-data'

const BetScreen: React.FC = () => {
  const { leagues, isLoadingLeagues }: LeaguesState = useSelector(
    leaguesSelector,
  )
  const [allLeagues, setAllLeagues] = useState<LeagueDataModel[]>(
    leagues?.response?.map((leagueData) => leagueData),
  )
  const navigate = useNavigate()
  const [windowWidth, setWindowWidth] = useState(window.innerWidth)
  const [windowHeight, setWindowHeight] = useState(window.innerHeight)
  const [leaguesFilters, setLeaguesFilters] = useState<LeaguesFilterModel>({
    current: true,
    season: 2022,
    type: 'league',
  })
  const dispatch: any = useDispatch()
  const [searchedLeagues, setSearchedLeagues] = useState<
    LeagueDataModel[] | []
  >([])
  const [standingsLoading, setStandingsLoading] = useState(false)
  const [leaguesStandings, setLeaguesStandings] = useState<StandingsModel[]>()

  useEffect(() => {
    if (!process.env.NODE_ENV || process.env.NODE_ENV === 'development') {
      // do nothing
    } else {
      setAllLeagues(leagues?.response.map((leagueData) => leagueData))
    }
  }, [JSON.stringify(leagues)])

  useEffect(() => {
    if (!process.env.NODE_ENV || process.env.NODE_ENV === 'development') {
      setAllLeagues(favLeaguesMock)
    } else {
      // production code
      dispatch(geFilteredLeaguesAction(leaguesFilters))
    }

    window.addEventListener('resize', updateWindowDimensions)
    return () => {
      window.removeEventListener('resize', updateWindowDimensions)
    }
  }, [])

  const updateWindowDimensions = () => {
    setWindowHeight(window.innerHeight)
    setWindowWidth(window.innerWidth)
  }

  const handleNextClick = () => {
    if (!process.env.NODE_ENV || process.env.NODE_ENV === 'development') {
      // TODO use Mock standings
      navigate('/fixtures', {
        state: {
          selectedLeagues: searchedLeagues.map(
            (searchedLeague: LeagueDataModel) => searchedLeague.league,
          ),
          leaguesStandings: MockLeaguesStandings,
        },
      })
    } else {
      setStandingsLoading(true)
      Promise.all(
        searchedLeagues.map((searchedLeague: LeagueDataModel) => {
          return getStandingsByLeagueId({
            leagueId: searchedLeague.league.id,
            season: seasonsBack[0],
          })
        }),
      )
        .then((standings) => {
          setLeaguesStandings(standings)
          navigate('/fixtures', {
            state: {
              selectedLeagues: searchedLeagues.map(
                (searchedLeague: LeagueDataModel) => searchedLeague.league,
              ),
              leaguesStandings: standings,
            },
          })
        })
        .finally(() => {
          setStandingsLoading(false)
        })
    }
  }

  return (
    <div
      style={{
        backgroundImage: ` url(${images.bgImage})`,
        backgroundRepeat: 'no-repeat',
        backgroundSize: 'cover',
        width: windowWidth,
        height: windowHeight,
      }}
      className=" flex flex-grow justify-center items-center flex-col pb-10 pt-28"
    >
      {standingsLoading || isLoadingLeagues ? (
        <CircularProgress />
      ) : (
        <>
          {allLeagues && (
            <div className=" flex flex-col items-center justify-center w-full px-20 mb-5">
              <div className=" text-white font-semibold">
                Search league/ Country
              </div>
              <Autocomplete
                className="bg-gray-200 min-w-full rounded-lg"
                multiple
                defaultValue={[]}
                value={searchedLeagues}
                id="leagueSearch"
                getOptionLabel={(league: LeagueDataModel) =>
                  `${league.league.name} - ${league.country.name}`
                }
                options={allLeagues?.map(
                  (league) => new LeagueDataModel(league),
                )}
                onChange={(event, value: LeagueDataModel[]) => {
                  setSearchedLeagues(value)
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    InputLabelProps={{ color: 'primary', inputMode: 'search' }}
                  />
                )}
              />
            </div>
          )}
          <button
            disabled={searchedLeagues?.length === 0 || standingsLoading}
            style={{
              backgroundColor:
                searchedLeagues?.length === 0 ? 'gray' : 'rgb(96 165 250)',
            }}
            className=" flex bg-blue-400 rounded p-4 items-center justify-center self-end w-60 text-black hover:bg-blue-200 mr-20"
            onClick={handleNextClick}
          >
            Next
          </button>
        </>
      )}
    </div>
  )
}

export default BetScreen
