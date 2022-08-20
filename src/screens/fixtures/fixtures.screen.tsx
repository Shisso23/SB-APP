/* eslint-disable react-hooks/exhaustive-deps */

import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Autocomplete, CircularProgress, TextField } from "@mui/material";
import moment from "moment";
import Modal from "react-modal";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import "./styles.css";

import { FixturesFilterModel, FixturesModel } from "../../models/fixtures";
import images from "../../assets/images";
import { LeagueDataLeagueModel } from "../../models/leagues";
import { getFilteredFixtures } from "../../services/fixtures/index";
import { FixtureDataModel } from "../../models/fixtures/index";
import { currentDate, toMomentDate } from "../../helpers/dateTimeHelper";
import { betOptions, levels, seasonsBack } from "../../variables/variables";
import { betOptionModel } from "../../models/bet-option-model/index";
import _, { Dictionary } from "lodash";
import {
  getH2HFixtures,
  getLastFiveTeamAwayFixtures,
  getLastFiveTeamHomeFixtures,
} from "../../helpers/prediction";
import { getStandingsByTeamId } from "../../services/standings";
import {
  StandingsResponseModel,
} from "../../models/standings-models";

Modal.setAppElement("#root");

const FixturesScreen: React.FC = () => {
  type LocationState = {
    selectedLeagues: LeagueDataLeagueModel[];
  };
  const navigate = useNavigate();
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [windowHeight, setWindowHeight] = useState(window.innerHeight);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [fromDate, setFromDate] = useState(new Date());
  const [loadingLeaguesFixtures, setLoadingLeaguesFixtures] = useState(false);
  const [toDate, setToDate] = useState(
    new Date(moment().add(1, "days").format("YYYY-MM-DD"))
  );
  const location = useLocation();
  const { selectedLeagues } = location.state as LocationState;
  const [futureFixtures, setFutureFixtures] = useState<FixtureDataModel[]>([]);
  const [allFixtures, setAllFixtures] = useState<FixtureDataModel[]>();
  const [currentFixtures, setCurrentFixtures] = useState<FixtureDataModel[]>();
  const [loadingStandings, setLoadingStandings] = useState<Boolean>(false);
  const [fixtureTeamsStandings, setFixtureTeamsStandings] =
    useState<StandingsResponseModel[]>();
  const [predictedFixtures, setPredictedFixtures] = useState<
    {
      fixtures: FixtureDataModel[];
      option: { name: String; id: number; level: number; shortName: String };
    }[]
  >(); //TODO try making a model for the bet option and reuse it
  const [groupedPredictionsData, setGroupedPredictionsData] = useState<
    Dictionary<
      {
        fixtures: FixtureDataModel[];
        option: {
          name: String;
          id: number;
          level: number;
          shortName: String;
        };
      }[]
    >
  >();
  const [selectedLevels, setSeletedLevels] = useState<number[]>([
    0, 1, 2, 3, 4, 5,
  ]);
  const [selectedOptions, setSelectedOptions] = useState<betOptionModel[] | []>(
    []
  );
  const [selectedFixtureRow, setSelectedFixtureRow] =
    useState<FixtureDataModel>();
  const minFixtureDate = new Date();
  const [readyToFtechLeagues, setReadyToFetchLeagues] = useState(false);

  useEffect(() => {
    window.addEventListener("resize", updateWindowDimensions);
    setReadyToFetchLeagues(true);
    setSelectedOptions(
      betOptions.filter((option) =>
        selectedLevels.some((level) => option.level === level)
      )
    );
    return () => {
      window.removeEventListener("resize", updateWindowDimensions);
    };
  }, []);

  useEffect(() => {
    if (readyToFtechLeagues) {
      fetchLeaguesSeasonsFixtures();
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
    if (selectedLevels.length > 0) {
      setSelectedOptions(
        betOptions.filter((option) =>
          selectedLevels.some((level) => option.level === level)
        )
      );
    } else {
      setSelectedOptions([]);
    }
  }, [selectedLevels.length]);

  useEffect(() => {
    if (currentFixtures) {
      predict();
    }
  }, [currentFixtures?.length]);

  useEffect(() => {
    if (selectedOptions) {
      predict();
    }
    if (selectedOptions.length === 0) {
      // setSeletedLevels([]);
    }
  }, [selectedOptions?.length]);

  useEffect(() => {
    const groupedPredictionsData = _.groupBy(
      predictedFixtures,
      (predictedFixture) => predictedFixture.option.shortName
    );
    setGroupedPredictionsData(groupedPredictionsData);
  }, [JSON.stringify(predictedFixtures)]);

  useEffect(() => {
    /*This predicted fixtures will give me a list of each prediction function result like. [{fixtures, option}, ...] so for me to display it on the jsx if one bet option is selected; only display the predictions for that bet option if there's any. If a level is selected; display prediction functions results for those options and merge them. if a fixtures is returned from 2 prediction functions. Add an Or eg. Over 1.5 or GG )
     */
    setCurrentFixtures(filterFixtresBetweenDates(fromDate, toDate));
  }, [fromDate.toString(), toDate.toString()]);

  const predict = () => {
    const predictions = selectedOptions.map((option: betOptionModel) =>
      option.predict({ currentFixtures, allFixtures })
    );
    setPredictedFixtures(predictions);
  };

  const filterFutureFixtures = (fixtures: FixtureDataModel[]) => {
    return fixtures.filter((fixtureData) => {
      return toMomentDate(fixtureData.fixture.date).isSameOrAfter(currentDate);
    });
  };

  const handleViewStandingsClick =
    ({ homeTeamId, awayTeamId, season, leagueId }) =>
    () => {
      getFixtureTeamsStandings({ homeTeamId, awayTeamId, season, leagueId });
    };

  const filterFixtresBetweenDates = (from: Date, to: Date) => {
    const fixtures = futureFixtures.filter((fixtureData) => {
      return (
        toMomentDate(fixtureData.fixture.date).isSameOrAfter(moment(from)) &&
        toMomentDate(fixtureData.fixture.date).isSameOrBefore(moment(to))
      );
    });
    return fixtures;
  };

  const getLeaguesSeasonsFixtures = async () => {
    setLoadingLeaguesFixtures(true);
    return Promise.all(
      selectedLeagues?.map(async (league: LeagueDataLeagueModel, index) => {
        const seasons = seasonsBack;
        return Promise.all(
          seasons.map(async (season: number) => {
            const getLeagueFixturesResponse: FixturesModel = await (
              await getFilteredFixtures(
                new FixturesFilterModel({ league: league.id, season })
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
    if(isModalOpen){
      setFixtureTeamsStandings(undefined)
    }
    setIsModalOpen(!isModalOpen);
  };

  const onLevelSelect = (selectedLevel: number) => () => {
    if (selectedLevels.includes(selectedLevel)) {
      setSeletedLevels(
        selectedLevels.filter((level) => level !== selectedLevel)
      );
    } else {
      setSeletedLevels([...selectedLevels, selectedLevel]);
    }
  };

  const handleFixtureRowClick = (selectedFixture: FixtureDataModel) => () => {
    setSelectedFixtureRow(selectedFixture);
    toggleModal();
  };

  const sortStandings = (fixtureTeamsStandings: StandingsResponseModel[]) => {
    return fixtureTeamsStandings.sort((standDingsTeam1, standingsTeam2) => {
      return (
        standDingsTeam1.league.standings[0][0].rank -
        standingsTeam2.league.standings[0][0].rank
      );
    });
  };

  const getFixtureTeamsStandings = ({ homeTeamId, awayTeamId, season, leagueId}) => {
    setLoadingStandings(true);
    Promise.all([
      getStandingsByTeamId({ teamId: homeTeamId, season, leagueId }),
      getStandingsByTeamId({ teamId: awayTeamId, season, leagueId }),
    ]).then((response) => {
      const sortedStandings = sortStandings([
        response[0].response[0],
        response[1].response[0],
      ]);
      setFixtureTeamsStandings(sortedStandings);
    }).finally(()=>{
      setLoadingStandings(false);
    });
  };

  const renderModalContent = () => {
    const homeTeam = selectedFixtureRow?.teams.home;
    const awayTeam = selectedFixtureRow?.teams.away;
    const homeTeamPreviousHomeFixtures = getLastFiveTeamHomeFixtures({
      teamId: homeTeam?.id,
      allFixtures,
    });
    const awayTeamPreviousAwayFixtures = getLastFiveTeamAwayFixtures({
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
        <span className=" text-2xl font-bold text-center">
          Fixture Deatails
        </span>
        <div className=" flex flex-row justify-between items-center bg-blue-400 w-full mt-5 rounded-lg px-3 pb-3 listView overflow-x-scroll  ">
          <div className=" flex flex-col mr-5">
            <div className="text-base font-bold text-center my-3">
              Head to Head
            </div>
            <div className="flex flex-col rounded-lg items-center justify-center">
              {fixtureH2h.map((fixtureData) => {
                return (
                  <div className=" flex flex-row w-full p-3 border justify-start items-center border-solid border-t-0 border-b border-l-0 border-r-0 ">
                    <div className=" flex flex-row w-36">
                      <img
                        src={`${fixtureData.teams.home.logo}`}
                        alt="country flag"
                        width={30}
                        height={30}
                        className=" mr-1"
                      />
                      <div className=" pt-1 truncate">
                        {fixtureData.teams.home.name}
                      </div>
                    </div>
                    <div className=" flex mx-3 w-20 items-center justify-center bg-green-300">{`${fixtureData.score.fulltime.home} - ${fixtureData.score.fulltime.away}`}</div>
                    <div className=" flex flex-row w-auto">
                      <img
                        src={`${fixtureData.teams.away.logo}`}
                        alt="country flag"
                        width={30}
                        height={30}
                        className=" mr-1"
                      />
                      <div className=" pt-1 truncate">
                        {fixtureData.teams.away.name}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className=" flex flex-col mr-5">
            <div className="text-base font-bold text-center my-3">
              Home team Previous Home Matches
            </div>
            <div className="flex flex-col rounded-lg items-center justify-center">
              {homeTeamPreviousHomeFixtures.map((fixtureData) => {
                return (
                  <div className=" flex flex-row w-full p-3 border justify-start items-center border-solid border-t-0 border-b border-l-0 border-r-0 ">
                    <div className=" flex flex-row w-36">
                      <img
                        src={`${fixtureData.teams.home.logo}`}
                        alt="country flag"
                        width={30}
                        height={30}
                        className=" mr-1"
                      />
                      <div className=" pt-1 truncate">
                        {fixtureData.teams.home.name}
                      </div>
                    </div>
                    <div className=" flex mx-3 w-20 items-center justify-center bg-green-300">{`${fixtureData.score.fulltime.home} - ${fixtureData.score.fulltime.away}`}</div>
                    <div className=" flex flex-row w-auto">
                      <img
                        src={`${fixtureData.teams.away.logo}`}
                        alt="country flag"
                        width={30}
                        height={30}
                        className=" mr-1"
                      />
                      <div className=" pt-1 truncate">
                        {fixtureData.teams.away.name}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className=" flex flex-col mr-5">
            <div className="text-base font-bold text-center my-3">
              Away team Previous Away Matches
            </div>
            <div className="flex flex-col rounded-lg items-center justify-center">
              {awayTeamPreviousAwayFixtures.map((fixtureData) => {
                return (
                  <div className=" flex flex-row w-full p-3 border justify-start items-center border-solid border-t-0 border-b border-l-0 border-r-0 ">
                    <div className=" flex w-36">
                      <img
                        src={`${fixtureData.teams.home.logo}`}
                        alt="country flag"
                        width={30}
                        height={30}
                        className=" mr-1"
                      />
                      <div className=" pt-1 truncate ">
                        {fixtureData.teams.home.name}
                      </div>
                    </div>
                    <div className=" flex mx-3 w-20 items-center justify-center bg-green-300">{`${fixtureData.score.fulltime.home} - ${fixtureData.score.fulltime.away}`}</div>
                    <div className=" flex flex-row w-auto overflow-x-hidden ">
                      <img
                        src={`${fixtureData.teams.away.logo}`}
                        alt="country flag"
                        width={30}
                        height={30}
                        className=" mr-1"
                      />
                      <div className=" pt-1 truncate">
                        {fixtureData.teams.away.name}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <button
          style={{ backgroundColor: "rgb(96 165 250)" }}
          className=" flex bg-blue-400 rounded p-4 items-center justify-center self-center text-black hover:bg-blue-200 my-5"
          onClick={handleViewStandingsClick({
            homeTeamId: homeTeam.id,
            awayTeamId: awayTeam.id,
            season: allFixtures[0]?.league.season,
            leagueId: fixtureH2h[0]?.league.id
          })}
        >
          View teams Standings
        </button>
        {loadingStandings? <CircularProgress />: fixtureTeamsStandings && (
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
            <div className=" w-9/12">
              {fixtureTeamsStandings.map((teamStandings) => {
                return (
                  <div className=" flex flex-row border border-solid justify-between w-full">
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
                );
              })}
            </div>
          </>
        || <div/>)}
      </div>
    );
  };

  const updateWindowDimensions = () => {
    setWindowHeight(window.innerHeight);
    setWindowWidth(window.innerWidth);
  };
  return (
    <div
      style={{
        backgroundImage: ` url(${images.bgImage})`,
        backgroundRepeat: "no-repeat",
        backgroundSize: "cover",
        width: windowWidth,
        height: windowHeight,
      }}
      className="pb-10 pt-28 flex flex-grow "
    >
      <div className=" flex flex-row justify-center flex-grow overflow-x-scroll listView ">
        <button
          onClick={() => navigate(-1)}
          className=" text-white border rounded-lg p-5 h-12 ml-2 flex items-center justify-center"
        >
          Go back
        </button>
        <div className=" flex flex-col justify-center flex-grow">
          <div className=" flex font-bold self-center text-lg py-2 bg-gray-300 w-64 mb-5 items-center justify-center text-center">
            Predictions
          </div>

          <div className=" flex overflow-y-scroll listView justify-center">
            {loadingLeaguesFixtures ? (
              <CircularProgress />
            ) : (
              <div className="flex flex-col w-10/12 items-center">
                {(predictedFixtures &&
                  Object.keys(groupedPredictionsData)?.map(
                    (OptionShortName) => {
                      return (
                        <>
                          <div className=" text-lg text-white font-bold bg-blue-500 mb-2">
                            {!groupedPredictionsData[OptionShortName].every(
                              (predFixture) => predFixture.fixtures.length === 0
                            ) && <div>{OptionShortName}</div>}
                          </div>
                          {groupedPredictionsData[OptionShortName].map(
                            (predictedionResult, predResultIndex) => {
                              return predictedionResult.fixtures.map(
                                (fixtureData, fixtureDataIndex) => {
                                  return (
                                    <div
                                      key={`${predResultIndex}-${fixtureDataIndex}`}
                                      className=" cursor-pointer flex flex-row py-6 my-2 px-2 w-4/6 rounded-md bg-blue-300 hover:bg-blue-200"
                                      onClick={handleFixtureRowClick(
                                        fixtureData
                                      )}
                                    >
                                      <div className=" text-left w-2/6">
                                        {`${fixtureData.league.name} (${fixtureData.league.country})`}
                                        <div>
                                          {`${toMomentDate(
                                            fixtureData.fixture.date
                                          ).format("DD-MMMM-YYYY HH:mm")}`}
                                        </div>
                                      </div>
                                      <div className=" flex flex-row  self-center justify-between flex-grow overflow-x-hidden">
                                        <div className=" flex flex-row w-1/2 pl-1">
                                          <img
                                            src={`${fixtureData.teams.home.logo}`}
                                            alt="country flag"
                                            width={30}
                                            height={30}
                                            className=" mr-1"
                                          />
                                          <div className=" text-base font-semibold  pr-3 text-black w-2/3 truncate ">
                                            {fixtureData.teams.home.name}
                                          </div>
                                        </div>
                                        <div className=" flex justify-start w-1/2 pl-1 overflow-x-hidden">
                                          <div className=" flex flex-row float-left w-full ">
                                            <img
                                              src={`${fixtureData.teams.away.logo}`}
                                              alt="country flag"
                                              width={30}
                                              height={30}
                                              className=" mr-1"
                                            />
                                            <div className="  text-base font-semibold text-black truncate">
                                              {fixtureData.teams.away.name}
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                      {/* <div className=" flex flex-row justify-center items-center">
                                        <p>{`${predictedionResult.option.shortName}`}</p>
                                      </div> */}
                                    </div>
                                  );
                                }
                              );
                            }
                          )}
                        </>
                      );
                    }
                  )) || <div />}
              </div>
            )}
          </div>
        </div>

        <div className=" w-2/12 flex  flex-col">
          <div className=" text-white font-semibold">Bet Options</div>
          <Autocomplete
            className="bg-gray-200 w-64 rounded-lg max-h-48 overflow-y-auto"
            multiple
            defaultValue={[]}
            value={selectedOptions}
            id="Bet Options"
            getOptionLabel={(option: betOptionModel) => `${option.name}`}
            options={betOptions.map((option) => option)}
            onChange={(event, value: betOptionModel[]) => {
              setSelectedOptions(value);
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                InputLabelProps={{ color: "primary", inputMode: "search" }}
              />
            )}
          />
          <div className=" mt-5 ">
            <div className=" text-white font-semibold ">
              Fixtures dates
              <div className=" flex flex-col justify-between w-full flex-grow  text-white text-base font-normal ">
                <span className=" mb-1">From:</span>
                <div>
                  <DatePicker
                    className=" text-black"
                    minDate={minFixtureDate}
                    selected={fromDate}
                    onChange={(date: Date) => setFromDate(date)}
                  />
                </div>
                <span className=" my-1">To:</span>
                <div className=" w-1/2 ">
                  <DatePicker
                    className=" text-black"
                    minDate={new Date()}
                    selected={toDate}
                    onChange={(date: Date) => setToDate(date)}
                  />
                </div>
              </div>
            </div>
          </div>

          {currentFixtures ? (
            <div className=" mt-5 w-28 flex justify-between flex-wrap text-left">
              <span className=" text-white font-semibold mb-2">
                Select dificulty levels
              </span>
              {levels.map((level) => {
                return (
                  <button
                    key={`${level}`}
                    className={` rounded-lg p-2 outline-1 border font-bold text-lg text-white m-1 w-12 ${
                      selectedLevels.includes(level)
                        ? "bg-blue-400 border-white"
                        : "bg-transparent border-blue-400"
                    } `}
                    onClick={onLevelSelect(level)}
                  >
                    {`${level}`}
                  </button>
                );
              })}
            </div>
          ) : (
            <></>
          )}
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
  );
};

export default FixturesScreen;
