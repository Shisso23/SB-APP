/* eslint-disable @typescript-eslint/ban-types */

import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { CircularProgress } from '@mui/material'
import moment from 'moment'
import Modal from 'react-modal'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import './styles.css'

import { FixturesFilterModel, FixturesModel } from '../../models/fixtures'
import { LeagueDataLeagueModel } from '../../models/leagues'
import { getFilteredFixtures } from '../../services/fixtures/index'
import { FixtureDataModel } from '../../models/fixtures/index'
import { toMomentDate } from '../../helpers/dateTimeHelper'
import { betOptions, seasonsBack } from '../../variables/variables'
import { betOptionModel } from '../../models/bet-option-model/index'
import _, { Dictionary } from 'lodash'
import { getStandingsByTeamId } from '../../services/standings'
import {
  StandingsModel,
  StandingsResponseModel,
} from '../../models/standings-models'
import { goupedFixturesMock, mockFixtures } from '../../mock-data'
import {
  getH2HFixtures,
  getLastFiveTeamAwayFixtures,
  getLastFiveTeamHomeFixtures,
} from '../../prediction-functions/shared-functions'

Modal.setAppElement('#root')

const FixturesScreen: React.FC = () => {
  type LocationState = {
    selectedLeagues: LeagueDataLeagueModel[]
    leaguesStandings: StandingsModel[]
  }
  const navigate = useNavigate()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [fromDate, setFromDate] = useState(
    new Date(moment().format('YYYY-MM-DD')),
  )
  const [loadingLeaguesFixtures, setLoadingLeaguesFixtures] = useState(false)
  const [toDate, setToDate] = useState(
    new Date(moment().add(1, 'days').format('YYYY-MM-DD')),
  )
  const location = useLocation()
  const { selectedLeagues, leaguesStandings } = location.state as LocationState
  const [futureFixtures, setFutureFixtures] = useState<FixtureDataModel[]>([])
  const [allFixtures, setAllFixtures] = useState<FixtureDataModel[]>()
  const [currentFixtures, setCurrentFixtures] = useState<FixtureDataModel[]>()
  const [loadingStandings, setLoadingStandings] = useState<boolean>(false)
  const [fixtureTeamsStandings, setFixtureTeamsStandings] = useState<
    StandingsResponseModel[]
  >()
  const [predictedFixtures, setPredictedFixtures] = useState<
    {
      fixtures: FixtureDataModel[]
      option: {
        name: string
        id: number
        level: number
        shortName: string
        description: string
      }
    }[]
  >() //TODO try making a model for the bet option and reuse it
  const [groupedPredictionsData, setGroupedPredictionsData] = useState<
    Dictionary<
      {
        fixtures: FixtureDataModel[]
        option: {
          name: string
          id: number
          level: number
          shortName: string
          description: string
        }
      }[]
    >
  >()
  const [selectedOptions, setSelectedOptions] = useState<betOptionModel[] | []>(
    [],
  )
  const [selectedFixtureRow, setSelectedFixtureRow] = useState<
    FixtureDataModel
  >()
  const minFixtureDate = new Date()
  const [readyToFtechLeagues, setReadyToFetchLeagues] = useState<boolean>(false)

  useEffect(() => {
    setReadyToFetchLeagues(true)
    console.log('ready to fetch')
    if (!process.env.NODE_ENV || process.env.NODE_ENV === 'development') {
      setPredictedFixtures(goupedFixturesMock)
    } else {
      // DO nothing
    }
    setSelectedOptions(betOptions)
  }, [])

  useEffect(() => {
    if (!process.env.NODE_ENV || process.env.NODE_ENV === 'development') {
      setAllFixtures(mockFixtures)
      setFutureFixtures(mockFixtures)
    } else {
      console.log('Second effect')
      console.log({ readyToFtechLeagues })
      if (readyToFtechLeagues) {
        console.log('now ready')
        fetchLeaguesSeasonsFixtures()
      }
    }
  }, [readyToFtechLeagues])

  const fetchLeaguesSeasonsFixtures = async () => {
    console.log('This gets called')
    getLeaguesSeasonsFixtures()
      .then((responses) => {
        setAllFixtures(
          responses.flat().sort((fixtureA, fixtureB) => {
            return fixtureB.fixture.timestamp - fixtureA.fixture.timestamp
          }),
        )
        setFutureFixtures(
          filterFutureFixtures(
            responses.flat().sort((fixtureA, fixtureB) => {
              return fixtureB.fixture.timestamp - fixtureA.fixture.timestamp
            }),
          ),
        )
      })
      .finally(() => {
        setLoadingLeaguesFixtures(false)
      })
  }

  useEffect(() => {
    setCurrentFixtures(filterFixtresBetweenDates(fromDate, toDate))
  }, [futureFixtures?.length])

  useEffect(() => {
    if (!process.env.NODE_ENV || process.env.NODE_ENV === 'development') {
      // DO nothing
    } else {
      if (currentFixtures) {
        predict()
      }
    }
  }, [currentFixtures?.length])

  useEffect(() => {
    if (!process.env.NODE_ENV || process.env.NODE_ENV === 'development') {
      // DO nothing
    } else {
      if (selectedOptions) {
        predict()
      }
    }
  }, [selectedOptions?.length])

  useEffect(() => {
    const groupedPredictionsData = _.groupBy(
      predictedFixtures,
      (predictedFixture) => predictedFixture.option.shortName,
    )
    setGroupedPredictionsData(groupedPredictionsData)
  }, [JSON.stringify(predictedFixtures)])

  useEffect(() => {
    /*This predicted fixtures will give me a list of each prediction function result like. [{fixtures, option}, ...] so for me to display it on the jsx if one bet option is selected; only display the predictions for that bet option if there's any. If a level is selected; display prediction functions results for those options and merge them. if a fixtures is returned from 2 prediction functions. Add an Or eg. Over 1.5 or GG )
     */
    setCurrentFixtures(filterFixtresBetweenDates(fromDate, toDate))
  }, [fromDate.toString(), toDate.toString()])

  const addOrRemoveBetOptions = (id: number) => {
    if (selectedOptions.some((option: betOptionModel) => option.id === id)) {
      setSelectedOptions(
        selectedOptions.filter((option: betOptionModel) => option.id !== id),
      )
    } else if (
      !selectedOptions.some((option: betOptionModel) => option.id === id)
    ) {
      setSelectedOptions([
        ...selectedOptions,
        betOptions.find((option) => option.id === id),
      ])
    }
  }

  const predict = () => {
    const predictions = selectedOptions.map((option: betOptionModel) =>
      option.predict({ currentFixtures, allFixtures, leaguesStandings }),
    )
    setPredictedFixtures(predictions)
  }

  const filterFutureFixtures = (fixtures: FixtureDataModel[]) => {
    return fixtures.filter((fixtureData) => {
      return toMomentDate(fixtureData.fixture.date).isSameOrAfter(
        new Date(moment().subtract(1, 'days').format('YYYY-MM-DD')),
      )
    })
  }

  const handleViewStandingsClick = ({
    homeTeamId,
    awayTeamId,
    season,
    leagueId,
  }) => () => {
    if (!process.env.NODE_ENV || process.env.NODE_ENV === 'development') {
      //TODO use Mock data here
    } else {
    getFixtureTeamsStandings({ homeTeamId, awayTeamId, season, leagueId })
    }
  }

  const filterFixtresBetweenDates = (from: Date, to: Date) => {
    const fixtures = futureFixtures.filter((fixtureData) => {
      return (
        toMomentDate(fixtureData.fixture.date).isSameOrAfter(moment(from)) &&
        toMomentDate(fixtureData.fixture.date).isSameOrBefore(moment(to))
      )
    })
    return fixtures
  }

  const getLeaguesSeasonsFixtures = async () => {
    setLoadingLeaguesFixtures(true)
    return Promise.all(
      selectedLeagues?.map(async (league: LeagueDataLeagueModel, index) => {
        const seasons = seasonsBack
        return Promise.all(
          seasons.map(async (season: number) => {
            const getLeagueFixturesResponse: FixturesModel = await (
              await getFilteredFixtures(
                new FixturesFilterModel({ league: league.id, season }),
              )
            ).data
            return getLeagueFixturesResponse.response
          }),
        ).then((response) => {
          return response.flat()
        })
      }),
    )
  }

  const toggleModal = () => {
    if (isModalOpen) {
      setFixtureTeamsStandings(undefined)
    }
    setIsModalOpen(!isModalOpen)
  }

  const handleFixtureRowClick = (selectedFixture: FixtureDataModel) => () => {
    setSelectedFixtureRow(selectedFixture)
    toggleModal()
  }

  const sortStandings = (fixtureTeamsStandings: StandingsResponseModel[]) => {
    return fixtureTeamsStandings.sort((standDingsTeam1, standingsTeam2) => {
      return (
        standDingsTeam1.league.standings[0][0].rank -
        standingsTeam2.league.standings[0][0].rank
      )
    })
  }

  const getFixtureTeamsStandings = ({
    homeTeamId,
    awayTeamId,
    season,
    leagueId,
  }) => {
    setLoadingStandings(true)
    Promise.all([
      getStandingsByTeamId({ teamId: homeTeamId, season, leagueId }),
      getStandingsByTeamId({ teamId: awayTeamId, season, leagueId }),
    ])
      .then((response) => {
        const sortedStandings = sortStandings([
          response[0].response[0],
          response[1].response[0],
        ])
        setFixtureTeamsStandings(sortedStandings)
      })
      .finally(() => {
        setLoadingStandings(false)
      })
  }

  const renderStandings = () => {
    try {
      return fixtureTeamsStandings.map((teamStandings) => {
        return (
          <div
            key={teamStandings.league.id}
            className=" flex flex-row border border-solid justify-between w-full"
          >
            <span className=" w-16">
              {teamStandings.league?.standings[0][0].rank}
            </span>
            <span className=" w-40 truncate text-pink-700">
              {teamStandings.league?.standings[0][0].team.name}
            </span>
            <span className=" w-16">
              {teamStandings.league?.standings[0][0].all.played}
            </span>
            <span className=" w-16">
              {teamStandings.league?.standings[0][0].all.win}
            </span>
            <span className=" w-16">
              {teamStandings.league?.standings[0][0].all.draw}
            </span>
            <span className=" w-16">
              {teamStandings.league?.standings[0][0].all.lose}
            </span>
            <span className=" w-16">
              {teamStandings.league?.standings[0][0].all.goals.for}
            </span>
            <span className=" w-16">
              {teamStandings.league?.standings[0][0].all.goals.against}
            </span>
            <span className=" w-16">
              {teamStandings.league?.standings[0][0].all.goals.for -
                teamStandings.league?.standings[0][0].all.goals.against}
            </span>
            <span className=" w-16">
              {teamStandings.league?.standings[0][0].points}
            </span>
          </div>
        )
      })
    } catch (exp) {
      return <div>Standings not available for this!</div>
    }
  }

  const renderPreviousFixtures = (fixtureData: FixtureDataModel) => {
    return (
      <>
        <span className="flex self-start text-left text-xs font-medium pl-1 mt-2">
          {`${toMomentDate(fixtureData.fixture.date).format(
            'DD-MMMM-YYYY HH:mm',
          )}`}
        </span>
        <div className=" flex flex-row w-full p-x-2 py-3 border justify-start items-center border-solid border-t-0 border-b border-l-0 border-r-0 ">
          <div className=" flex w-2/6 items-center">
            <img
              src={`${fixtureData.teams.home.logo}`}
              alt="country flag"
              width={17}
              height={17}
              className=" mr-1 mt-1"
            />
            <div className=" pt-1 truncate text-sm ">
              {fixtureData.teams.home.name}
            </div>
          </div>
          <div className=" flex mx-3 w-1/6 items-center text-sm justify-center bg-green-300">{`${fixtureData.score.fulltime.home} - ${fixtureData.score.fulltime.away}`}</div>
          <div className=" flex items-center flex-row w-2/6 overflow-x-hidden ">
            <img
              src={`${fixtureData.teams.away.logo}`}
              alt="country flag"
              width={17}
              height={17}
              className=" mr-1 mt-1"
            />
            <div className=" pt-1 truncate text-sm">
              {fixtureData.teams.away.name}
            </div>
          </div>
        </div>
      </>
    )
  }

  const renderModalContent = () => {
    const homeTeam = selectedFixtureRow?.teams.home
    const awayTeam = selectedFixtureRow?.teams.away
    const homeTeamPreviousHomeFixtures = getLastFiveTeamHomeFixtures({
      teamId: homeTeam?.id,
      allFixtures,
    })
    const awayTeamPreviousAwayFixtures = getLastFiveTeamAwayFixtures({
      teamId: awayTeam?.id,
      allFixtures,
    })
    const fixtureH2h = getH2HFixtures({
      teamOneId: homeTeam?.id,
      teamTwoId: awayTeam?.id,
      allFixtures,
    })

    return (
      <div className=" flex flex-col items-center justify-center listView">
        <div className=" w-full">
          <button
            className=" bg-black text-white float-right py-3 px-5 rounded-lg"
            onClick={toggleModal}
          >
            Close
          </button>
        </div>
        <span className=" text-lg sm:text-2xl font-bold text-center">
          Fixture Details
        </span>
        <div className=" flex flex-row justify-between items-start bg-blue-400 w-full mt-5 rounded-lg px-3 listView overflow-x-scroll  ">
          <div className=" flex flex-grow flex-col mr-5 h-full">
            <div className="text-xs sm:text-base font-bold text-center my-3">
              Head to Head
            </div>
            <div className="flex flex-col rounded-lg items-center justify-center">
              {fixtureH2h.map((fixtureData) => {
                return renderPreviousFixtures(fixtureData)
              })}
            </div>
          </div>

          <div className=" flex flex-grow flex-col mr-5 h-full">
            <div className="text-xs sm:text-base font-bold text-center my-3">
              Home team Previous Home Matches
            </div>
            <div className="flex flex-col rounded-lg items-center justify-center">
              {homeTeamPreviousHomeFixtures.map((fixtureData) => {
                return renderPreviousFixtures(fixtureData)
              })}
            </div>
          </div>

          <div className=" flex flex-grow flex-col mr-5 h-full">
            <div className="text-xs sm:text-base font-bold text-center my-3">
              Away team Previous Away Matches
            </div>
            <div className="flex flex-col rounded-lg items-center justify-center">
              {awayTeamPreviousAwayFixtures.map((fixtureData) => {
                return renderPreviousFixtures(fixtureData)
              })}
            </div>
          </div>
        </div>
        <button
          style={{ backgroundColor: 'rgb(96 165 250)' }}
          className=" flex bg-blue-400 rounded p-2 sm:p-4 items-center justify-center self-center text-black hover:bg-blue-200 my-5"
          onClick={handleViewStandingsClick({
            homeTeamId: homeTeam.id,
            awayTeamId: awayTeam.id,
            season: allFixtures[0]?.league.season,
            leagueId: fixtureH2h[0]?.league.id,
          })}
        >
          View teams Standings
        </button>
        {loadingStandings ? (
          <CircularProgress />
        ) : (
          fixtureTeamsStandings &&
          ((
            <>
              <div className=" flex flex-row border border-solid justify-between font-bold bg-gray-400 w-9/12   ">
                <span className=" w-16">Rank</span>
                <span className=" w-40">Team</span>
                <span className=" w-16">MP</span>
                <span className=" w-16">W</span>
                <span className=" w-16">D</span>
                <span className=" w-16">L</span>
                <span className=" w-16">GF</span>
                <span className=" w-16">GA</span>
                <span className=" w-16">GD</span>
                <span className=" w-16">Pts</span>
              </div>
              <div className=" w-9/12">{renderStandings()}</div>
            </>
          ) || <div />)
        )}
      </div>
    )
  }

  const renderBetOptions = () => {
    return (
      <div className="flex self-center items-center justify-between space-x-2 py-1 overflow-x-scroll betOptions h-full px-4 mb-5 flex-grow-0 ">
        {betOptions.map((option) => (
          <div
            className={`flex w-96 items-center border border-white justify-center p-3 whitespace-nowrap h-full cursor-pointer text-justify place-content-center bg-${
              selectedOptions.some(
                (option_: betOptionModel) => option_.id === option.id,
              )
                ? 'cyan-500'
                : 'white'
            } border rounded h-1/2`}
            key={option.id}
            onClick={() => addOrRemoveBetOptions(option.id)}
          >
            {option.name}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className=" screen-h self-start absolute w-screen">
      <div className=" flex flex-row overflow-hidden h-full flex-grow bg-gray-900 ">
        <button
          onClick={() => navigate(-1)}
          className="  bg-slate-500 w-1/12 mx-6 text-white border rounded-lg p-3 text-sm h-8 sm:h-10 sm:text-base ml-2 flex items-center justify-center mt-3"
        >
          Back
        </button>
        <div className=" flex flex-col justify-center w-9/12 items-center flex-grow">
          <div
            className=" flex font-bold self-center text-lg py-2 items-center justify-center text-center text-m border rounded-lg bg-yellow-500 w-40 
        sm:w-64 sm:mb-5 mb-2 "
          >
            Select Bet Options
          </div>
          <div className=" h-16 w-full mb-5">{renderBetOptions()}</div>

          <>
            {loadingLeaguesFixtures ? (
              <CircularProgress />
            ) : (
              <div className="flex overflow-y-scroll listView scroll-m-20 overflow-x-hidden pb-10 sxroll flex-col w-full items-center">
                {(predictedFixtures &&
                  Object.keys(groupedPredictionsData)?.map(
                    (OptionShortName) => {
                      return (
                        <>
                          <div className=" flex flex-col items-center">
                            <div className=" text-base text-yellow-500 font-bold sm:mb-2">
                              {!groupedPredictionsData[OptionShortName].every(
                                (predFixture) =>
                                  predFixture.fixtures.length === 0,
                              ) && <div>{OptionShortName}</div>}
                            </div>
                            <span className=" text-white text-xs bg-blue-500">
                              {!groupedPredictionsData[OptionShortName].every(
                                (predFixture) =>
                                  predFixture.fixtures.length === 0,
                              ) &&
                                betOptions.find(
                                  (option) =>
                                    option.shortName === OptionShortName,
                                )?.description}
                            </span>
                          </div>
                          {groupedPredictionsData[OptionShortName].map(
                            (predictedionResult, predResultIndex) => {
                              return predictedionResult.fixtures.map(
                                (fixtureData, fixtureDataIndex) => {
                                  return (
                                    <div
                                      key={`${predResultIndex}-${fixtureDataIndex}`}
                                      className=" cursor-pointer flex py-6 my-2 px-2 w-full rounded-md text-xs md:text-m flex-col sm:flex-row bg-cyan-500 backdrop-blur-[10px] hover:bg-cyan-400"
                                      onClick={handleFixtureRowClick(
                                        fixtureData,
                                      )}
                                    >
                                      <div className=" text-left mb-2 sm:w-2/6 sm:ml-2 flex-row-reverse text-sm">
                                        {`${fixtureData.league.name} (${fixtureData.league.country})`}
                                        <div>
                                          {`${toMomentDate(
                                            fixtureData.fixture.date,
                                          ).format('DD-MMMM-YYYY HH:mm')}`}
                                        </div>
                                      </div>
                                      <div className=" flex flex-row sm:w-4/6 self-center justify-between flex-grow overflow-x-hidden">
                                        <div className=" flex flex-row w-1/2 pl-1">
                                          <img
                                            src={`${fixtureData.teams.home.logo}`}
                                            alt="country flag"
                                            width={17}
                                            height={17}
                                            className=" mr-1 mt-1"
                                          />
                                          <div className=" text-xs font-semibold truncate  pr-3 text-black w-2/3 ">
                                            {fixtureData.teams.home.name}
                                          </div>
                                        </div>
                                        <div className=" flex justify-start w-1/2 pl-1 overflow-x-hidden">
                                          <div className=" flex flex-row float-left w-full ">
                                            <img
                                              src={`${fixtureData.teams.away.logo}`}
                                              alt="country flag"
                                              width={17}
                                              height={17}
                                              className=" mr-1 mt-1"
                                            />
                                            <div className="  text-sm truncate font-semibold text-black">
                                              {fixtureData.teams.away.name}
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                      {/* <div className=" flex flex-row justify-center items-center">
                                        <p>{`${predictedionResult.option.shortName}`}</p>
                                      </div> */}
                                    </div>
                                  )
                                },
                              )
                            },
                          )}
                        </>
                      )
                    },
                  )) || <div className="bg-slate-600 w-96 h-96" />}
              </div>
            )}
          </>
        </div>

        <div className=" w-2/12 flex flex-row justify-center text-yellow-500 font-semibold mt-28">
            <div>
              Fixtures dates
              <div className=" flex flex-col justify-between w-full  text-white text-base font-normal ">
                <span className=" mb-1">From:</span>
                <div>
                  <DatePicker
                    className=" text-black border rounded-lg border-yellow-500"
                    minDate={minFixtureDate}
                    selected={fromDate}
                    onChange={(date: Date) => setFromDate(date)}
                  />
                </div>
                <span className=" my-1">To:</span>
                <div className=" w-1/2 ">
                  <DatePicker
                    className=" text-black border rounded-lg border-yellow-500"
                    minDate={new Date()}
                    selected={toDate}
                    onChange={(date: Date) => setToDate(date)}
                  />
                </div>
              </div>
            </div>
        </div>
        {groupedPredictionsData ? (
          <Modal
            isOpen={isModalOpen}
            overlayClassName=" z-40 w-3/4 h-2/4"
            onRequestClose={toggleModal}
            contentLabel="My dialog"
          >
            {(selectedFixtureRow && renderModalContent()) || <></>}
          </Modal>
        ) : (
          <></>
        )}
      </div>
    </div>
  )
}

export default FixturesScreen
