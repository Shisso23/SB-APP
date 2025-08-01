/* eslint-disable @typescript-eslint/ban-types */

import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { CircularProgress } from "@mui/material";
import moment from "moment";
import Modal from "react-modal";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import "./styles.css";

import { FixturesFilterModel, FixturesModel } from "../../models/fixtures";
import { LeagueDataModel } from "../../models/leagues";
import { getFilteredFixtures } from "../../services/fixtures/index";
import { FixtureDataModel } from "../../models/fixtures/index";
import { toMomentDate } from "../../helpers/dateTimeHelper";
import { betOptions, numberOfSeasonsBack } from "../../variables/variables";
import { betOptionModel } from "../../models/bet-option-model/index";
import _ from "lodash";
import {
  StandingsDataStandingModel,
  StandingsModel,
} from "../../models/standings-models";
import { goupedFixturesMock, mockFixtures } from "../../mock-data";
import {
  getH2HFixtures,
  getLastFiveTeamFixtures,
} from "../../prediction-functions/shared-functions";

Modal.setAppElement("#root");

const FixturesScreen: React.FC = () => {
  type LocationState = {
    selectedLeagues: LeagueDataModel[];
    leaguesStandings: StandingsModel[];
  };
  const navigate = useNavigate();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [fromDate, setFromDate] = useState(
    new Date(moment().format("YYYY-MM-DD"))
  );
  const [loadingLeaguesFixtures, setLoadingLeaguesFixtures] = useState(false);
  const [toDate, setToDate] = useState(
    new Date(moment().add(1, "days").format("YYYY-MM-DD"))
  );
  const location = useLocation();
  const { selectedLeagues, leaguesStandings } = location.state as LocationState;
  const [futureFixtures, setFutureFixtures] = useState<FixtureDataModel[]>([]);
  const [allFixtures, setAllFixtures] = useState<FixtureDataModel[]>();
  const [currentFixtures, setCurrentFixtures] = useState<FixtureDataModel[]>();
  const [fixtureTeamsStandings, setFixtureTeamsStandings] =
    useState<StandingsDataStandingModel[]>();
  const [predictedFixtures, setPredictedFixtures] = useState<
    {
      fixtures: FixtureDataModel[];
      option: {
        name: string;
        id: number;
        level: number;
        shortName: string;
        description: string;
      };
    }[]
  >(); //TODO try making a model for the bet option and reuse it
  interface groupedData {
    [fixture: number]: {
      name: string;
      id: number;
      level: number;
      shortName: string;
      description: string;
    }[];
  }
  const [groupedData, setGroupedData] = useState<groupedData>({});
  const [selectedOptions, setSelectedOptions] = useState<betOptionModel[] | []>(
    []
  );
  const [selectedFixtureRow, setSelectedFixtureRow] =
    useState<FixtureDataModel>();
  const minFixtureDate = new Date();
  const [readyToFtechLeagues, setReadyToFetchLeagues] =
    useState<boolean>(false);

  useEffect(() => {
    setReadyToFetchLeagues(true);
    if (!process.env.NODE_ENV || process.env.NODE_ENV === "development") {
      setPredictedFixtures(goupedFixturesMock);
    } else {
      //DO nothing
    }
    setSelectedOptions(betOptions);
  }, []);

  useEffect(() => {
    if (!process.env.NODE_ENV || process.env.NODE_ENV === "development") {
      setAllFixtures(mockFixtures);
      setFutureFixtures(mockFixtures);
    } else {
      if (readyToFtechLeagues) {
        fetchLeaguesSeasonsFixtures();
      }
    }
  }, [readyToFtechLeagues]);

  const fetchLeaguesSeasonsFixtures = async () => {
    getLeaguesSeasonsFixtures()
      .then((responses) => {
        setAllFixtures(
          responses.flat().sort((fixtureA, fixtureB) => {
            return fixtureB.fixture.timestamp - fixtureA.fixture.timestamp;
          })
        );
        setFutureFixtures(
          filterFutureFixtures(
            responses.flat().sort((fixtureA, fixtureB) => {
              return fixtureB.fixture.timestamp - fixtureA.fixture.timestamp;
            })
          )
        );
      })
      .finally(() => {
        setLoadingLeaguesFixtures(false);
      });
  };

  useEffect(() => {
    setCurrentFixtures(filterFixtresBetweenDates(fromDate, toDate));
  }, [futureFixtures?.length]);

  useEffect(() => {
    if (!process.env.NODE_ENV || process.env.NODE_ENV === "development") {
      // DO nothing
    } else {
      if (currentFixtures) {
        predict();
      }
    }
  }, [currentFixtures?.length]);

  useEffect(() => {
    if (!process.env.NODE_ENV || process.env.NODE_ENV === "development") {
      // DO nothing
    } else {
      if (selectedOptions && currentFixtures) {
        predict();
      }
    }
  }, [selectedOptions?.length]);

  useEffect(() => {
    if (predictedFixtures && currentFixtures) {
      const grouped: groupedData = {};
      predictedFixtures.map((predictedFixture) => {
        predictedFixture.fixtures.forEach((fixture) => {
          const fixtureId = fixture.fixture.id;
          if (!grouped[fixtureId]) {
            grouped[fixtureId] = [];
          }
          grouped[fixtureId].push(predictedFixture.option);
        });
      });

      setGroupedData(grouped);
    }
  }, [JSON.stringify(predictedFixtures)]);

  useEffect(() => {
    /*This predicted fixtures will give me a list of each prediction function result like. [{fixtures, option}, ...] so for me to display it on the jsx if one bet option is selected; only display the predictions for that bet option if there's any. If a level is selected; display prediction functions results for those options and merge them. if a fixtures is returned from 2 prediction functions. Add an Or eg. Over 1.5 or GG )
     */
    setCurrentFixtures(filterFixtresBetweenDates(fromDate, toDate));
  }, [fromDate.toString(), toDate.toString()]);

  const addOrRemoveBetOptions = (id: number) => {
    if (selectedOptions.some((option: betOptionModel) => option.id === id)) {
      setSelectedOptions(
        selectedOptions.filter((option: betOptionModel) => option.id !== id)
      );
    } else if (
      !selectedOptions.some((option: betOptionModel) => option.id === id)
    ) {
      setSelectedOptions([
        ...selectedOptions,
        betOptions.find((option) => option.id === id),
      ]);
    }
  };

  const predict = () => {
    const predictions = selectedOptions
      .map((option: betOptionModel) =>
        option.predict({ currentFixtures, allFixtures, leaguesStandings })
      )
      .filter((predFixtures) => predFixtures.fixtures.length > 0);

    setPredictedFixtures(predictions);
  };

  const filterFutureFixtures = (fixtures: FixtureDataModel[]) => {
    return fixtures.filter((fixtureData) => {
      return fixtureData && toMomentDate(fixtureData.fixture.date).isSameOrAfter(
        new Date(moment().subtract(1, "days").format("YYYY-MM-DD"))
      );
    });
  };

  const handleViewStandingsClick =
    ({ homeTeamId, awayTeamId, leagueId }) =>
    () => {
      if (!process.env.NODE_ENV || process.env.NODE_ENV === "development") {
        //TODO use Mock data here
      } else {
        getFixtureTeamsStandings({ homeTeamId, awayTeamId, leagueId });
      }
    };

  const filterFixtresBetweenDates = (from: Date, to: Date) => {
    const fixtures = futureFixtures.filter((fixtureData) => {
      return (
        toMomentDate(fixtureData?.fixture.date).isSameOrAfter(moment(from)) &&
        toMomentDate(fixtureData?.fixture.date).isSameOrBefore(moment(to))
      );
    });
    return fixtures;
  };

  const getLeaguesSeasonsFixtures = async () => {
    setLoadingLeaguesFixtures(true);
    return Promise.all(
      selectedLeagues?.map(async (league: LeagueDataModel) => {
        const seasons: number[] = [];
        seasons[0] = league.seasons.find(
          (season) => season.current === true
        ).year;
        for (let i = 1; i < numberOfSeasonsBack; i++) {
          seasons[i] = seasons[0] - i;
        }
        return Promise.all(
          seasons.map(async (season: number) => {
            const getLeagueFixturesResponse: FixturesModel = await (
              await getFilteredFixtures(
                new FixturesFilterModel({ league: league?.league.id, season })
              )
            ).data;
            return getLeagueFixturesResponse.response;
          })
        ).then((response) => {
          return response.flat();
        });
      })
    );
  };

  const toggleModal = () => {
    if (isModalOpen) {
      setFixtureTeamsStandings(undefined);
    }
    setIsModalOpen(!isModalOpen);
  };

  const handleFixtureRowClick = (selectedFixture: FixtureDataModel) => () => {
    setSelectedFixtureRow(selectedFixture);
    toggleModal();
  };

  const getFixtureTeamsStandings = ({ homeTeamId, awayTeamId, leagueId }) => {
    const selectedLeagueStandings = leaguesStandings
      .find((standings) => {
        return standings.response[0]?.league.id === leagueId;
      })
      .response[0]?.league.standings[0].filter(
        (standing) =>
          standing.team.id === homeTeamId || standing.team.id === awayTeamId
      );
    setFixtureTeamsStandings(selectedLeagueStandings);
  };

  const renderStandings = () => {
    try {
      return fixtureTeamsStandings.map((teamStanding) => {
        return (
          <div
            key={""}
            className=" flex flex-row border border-solid justify-between w-full"
          >
            <span className=" w-16">{teamStanding?.rank}</span>
            <span className=" w-40 truncate text-pink-700">
              {teamStanding.team.name}
            </span>
            <span className=" w-16">{teamStanding.all.played}</span>
            <span className=" w-16">{teamStanding.all.win}</span>
            <span className=" w-16">{teamStanding.all.draw}</span>
            <span className=" w-16">{teamStanding.all.lose}</span>
            <span className=" w-16">{teamStanding.all.goals.for}</span>
            <span className=" w-16">{teamStanding.all.goals.against}</span>
            <span className=" w-16">
              {teamStanding.all.goals.for - teamStanding.all.goals.against}
            </span>
            <span className=" w-16">{teamStanding.points}</span>
          </div>
        );
      });
    } catch (exp) {
      return <div>Standings not available for this!</div>;
    }
  };

  const renderPreviousFixtures = (fixtureData: FixtureDataModel) => {
    return (
      <>
        <span className="flex self-start text-left text-xs font-medium pl-1 mt-2">
          {`${toMomentDate(fixtureData.fixture.date).format(
            "DD-MMMM-YYYY HH:mm"
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
    );
  };

  const renderModalContent = () => {
    const homeTeam = selectedFixtureRow?.teams.home;
    const awayTeam = selectedFixtureRow?.teams.away;
    const homeTeamPreviousFixtures = getLastFiveTeamFixtures({
      teamId: homeTeam?.id,
      allFixtures,
    });
    const awayTeamAwayFixtures = getLastFiveTeamFixtures({
      teamId: awayTeam?.id,
      allFixtures,
    });
    const fixtureH2h = getH2HFixtures({
      teamOneId: homeTeam?.id,
      teamTwoId: awayTeam?.id,
      allFixtures,
    });

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
        <div className=" flex flex-row justify-between items-start bg-cyan-500 w-full mt-5 rounded-lg px-3 listView overflow-x-scroll  ">
          <div className=" flex flex-grow flex-col mr-5 h-full">
            <div className="text-xs sm:text-base font-bold text-center my-3">
              Head to Head
            </div>
            <div className="flex flex-col rounded-lg items-center justify-center">
              {fixtureH2h.map((fixtureData) => {
                return renderPreviousFixtures(fixtureData);
              })}
            </div>
          </div>

          <div className=" flex flex-grow flex-col mr-5 h-full">
            <div className="text-xs sm:text-base font-bold text-center my-3">
              Home team Previous Matches
            </div>
            <div className="flex flex-col rounded-lg items-center justify-center">
              {homeTeamPreviousFixtures.map((fixtureData) => {
                return renderPreviousFixtures(fixtureData);
              })}
            </div>
          </div>

          <div className=" flex flex-grow flex-col mr-5 h-full">
            <div className="text-xs sm:text-base font-bold text-center my-3">
              Away team Previous Matches
            </div>
            <div className="flex flex-col rounded-lg items-center justify-center">
              {awayTeamAwayFixtures.map((fixtureData) => {
                return renderPreviousFixtures(fixtureData);
              })}
            </div>
          </div>
        </div>
        <button
          className=" flex bg-cyan-500 rounded p-2 sm:p-4 items-center justify-center self-center text-black hover:bg-blue-200 my-5"
          onClick={handleViewStandingsClick({
            homeTeamId: homeTeam.id,
            awayTeamId: awayTeam.id,
            leagueId: fixtureH2h[0]?.league.id,
          })}
        >
          View teams Standings
        </button>
        {fixtureTeamsStandings &&
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
          ) || <div />)}
      </div>
    );
  };

  const renderBetOptions = () => {
    return (
      <div className="flex self-center items-center justify-between space-x-2 py-1 overflow-x-scroll h-full betOptions  px-4 mb-5 ">
        {betOptions.map((option) => (
          <div
            className={`flex w-96 items-center border border-white justify-center p-4  whitespace-nowrap h-full cursor-pointer text-justify place-content-center bg-${
              selectedOptions.some(
                (option_: betOptionModel) => option_.id === option.id
              )
                ? "cyan-500"
                : "white"
            } border rounded h-1/2`}
            key={option.id}
            onClick={() => addOrRemoveBetOptions(option.id)}
          >
            {option.name}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className=" screen-h self-start justify-between absolute w-screen pt-4 flex flex-col bg-gray-900">
      <div className=" h-16 w-full mb-5 bg-gray-900">{renderBetOptions()}</div>
      <div className=" flex flex-row overflow-hidden h-full bg-gray-900 pb-100  flex-1 ">
        <button
          onClick={() => navigate(-1)}
          className="  bg-slate-500 w-1/12 mx-6 text-white border rounded-lg p-3 text-sm h-8 sm:h-10 sm:text-xs ml-2 overflow-hidden flex items-center justify-center mt-3"
        >
          Back
        </button>
        <div className=" flex flex-col justify-center w-9/12 items-center flex-grow">
          <div
            className=" flex font-bold self-center text-lg py-2 items-center justify-center text-center text-m border rounded-lg bg-yellow-500 w-40 
        sm:w-64 sm:mb-5 mb-2 "
          >
            Predictions: {groupedData &&Object.keys(groupedData).length}
          </div>
          <>
            {loadingLeaguesFixtures ? (
              <CircularProgress />
            ) : (
              <div className="flex overflow-y-scroll listView scroll-m-20 overflow-x-hidden pb-10 sxroll flex-col w-full items-center">
                {predictedFixtures &&
                predictedFixtures.every(
                  (fixture) => fixture.fixtures.length === 0
                ) ? (
                  selectedOptions.length === 0 ? (
                    <div className="font-bold flex items-center justify-center text-lg text-slate-300">
                      Please select bet options!
                    </div>
                  ) : (
                    <div className="font-bold flex items-center justify-center text-lg text-slate-300">
                      No predictions were made for selected dates. Please try
                      different dates
                    </div>
                  )
                ) : (
                  (predictedFixtures &&
                    Object.keys(groupedData).map((fixtureId) => {
                      const currentFixture = currentFixtures.find(
                        (fixture) => `${fixture.fixture.id}` === fixtureId
                      );
                      return (
                        <>
                          <div
                            key={fixtureId}
                            className=" cursor-pointer flex py-6 px-2 w-full rounded-md text-xs md:text-m flex-col sm:flex-row bg-cyan-500 backdrop-blur-[10px] hover:bg-cyan-400"
                            onClick={handleFixtureRowClick(currentFixture)}
                          >
                            <div className=" text-left mb-2 sm:w-2/6 sm:ml-2 flex-row-reverse text-sm">
                              {`${currentFixture?.league.name} (${currentFixture?.league.country})`}
                              <div>
                                {`${toMomentDate(
                                  currentFixture?.fixture.date
                                ).format("DD-MMMM-YYYY HH:mm")}`}
                              </div>
                            </div>
                            <div className=" flex flex-row sm:w-4/6 self-center justify-between flex-grow overflow-x-hidden">
                              <div className=" flex flex-row w-1/2 pl-1">
                                <img
                                  src={`${currentFixture?.teams.home.logo}`}
                                  alt="country flag"
                                  width={17}
                                  height={17}
                                  className=" mr-1 mt-1"
                                />
                                <div className=" text-xs font-semibold truncate  pr-3 text-black w-2/3 ">
                                  {currentFixture?.teams.home.name}
                                </div>
                              </div>
                              <div className=" flex justify-start w-1/2 pl-1 overflow-x-hidden">
                                <div className=" flex flex-row float-left w-full ">
                                  <img
                                    src={`${currentFixture?.teams.away.logo}`}
                                    alt="country flag"
                                    width={17}
                                    height={17}
                                    className=" mr-1 mt-1"
                                  />
                                  <div className="  text-sm truncate font-semibold text-black">
                                    {currentFixture?.teams.away.name}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-row space-x-2 flex-wrap mb-2  p-2 mx-1">
                            {groupedData[currentFixture?.fixture.id]?.map(
                              (option) => (
                                <div
                                  key={option.id}
                                  className=" text-base text-yellow-500 font-bold sm:mb-3 border border-cyan-900 p-2 rounded-sm"
                                >
                                  <div>{option.shortName}</div>
                                </div>
                              )
                            )}
                          </div>
                        </>
                      );
                    })) || <div className="bg-slate-600 w-96 h-96" />
                )}
              </div>
            )}
          </>
        </div>

        <div className=" w-2/12 flex flex-row justify-center  overflow-hidden text-yellow-500 font-semibold mt-28">
          <div>
            Fixtures dates
            <div className=" flex flex-col justify-between w-full overflow-hidden  text-white text-base font-normal ">
              <span className=" mb-1">From:</span>
              <div className=" overflow-hidden">
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
        {Object.keys(groupedData).length > 0 ? (
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
  );
};

export default FixturesScreen;
