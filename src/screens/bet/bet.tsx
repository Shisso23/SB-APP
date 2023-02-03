import React, { useEffect, useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { useNavigate } from 'react-router-dom'

import './styles.css'
import { geFilteredLeaguesAction } from '../../reducers/leagues/leagues.actions'
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
    <div className=" flex flex-grow min-h-screen justify-center outline-none items-center flex-col bg-gray-900 pb-20 pt-28">
      {standingsLoading || isLoadingLeagues ? (
        <CircularProgress />
      ) : (
        <>
          {allLeagues && (
            <div className=" flex items-center justify-center border-none w-full px-20 mb-5">
              <Autocomplete
                className="flex-grow pl-5 text-sm rounded-full w-full text-gray-100 placeholder-gray-200"
                multiple
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
                  <TextField className="flex pl-5 bg-gray-200 outline-none text-sm rounded-full w-full text-gray-100 placeholder-gray-200"
                    {...params}
                    InputLabelProps={{ color: 'primary', inputMode: 'search' }} placeholder="Enter league or Country"
                  />
                )}
              />
            </div>
          )}
          <button
            disabled={searchedLeagues?.length === 0 || standingsLoading}
            className="text-base flex bg-gradient-to-r from-cyan-500 to-teal-500 rounded p-3 items-center self-center justify-center w-40 text-white hover:bg-blue-200"
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
