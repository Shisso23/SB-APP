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
import {
  getFilteredFixtures,
  getH2hFixtures,
} from "../../services/fixtures/index";
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
    new Date(moment().add(2, "days").format("YYYY-MM-DD"))
  );
  const location = useLocation();
  const { selectedLeagues } = location.state as LocationState;
  const [futureFixtures, setFutureFixtures] = useState<FixtureDataModel[]>([]);
  const [allFixtures, setAllFixtures] = useState<FixtureDataModel[]>();
  const [currentFixtures, setCurrentFixtures] = useState<FixtureDataModel[]>();
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
  const [selectedLevels, setSeletedLevels] = useState<number[]>([0]);
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
        //TODO Remove from here because it executes twice
        setAllFixtures(responses.flat().sort((fixtureA, fixtureB)=> {
          return fixtureB.fixture.timestamp - fixtureA.fixture.timestamp
      }));
        setFutureFixtures(filterFutureFixtures(responses.flat().sort((fixtureA, fixtureB)=> {
          return fixtureB.fixture.timestamp - fixtureA.fixture.timestamp
      })));
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
      setSeletedLevels([]);
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
        const seasons = seasonsBack; //TODO Get from variables
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
    console.log("Modal toggled");
    toggleModal();
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
      <div className=" flex flex-col items-center justify-center">
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
        <div className=" flex flex-row justify-between items-center bg-blue-400 w-full mt-5 rounded-lg px-3 pb-3 ">
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
                        width={32}
                        height={32}
                        className=" mr-1"
                      />
                      <div className=" pt-1 truncate">{fixtureData.teams.home.name}</div>
                    </div>
                    <div className=" flex mx-3 w-20 items-center justify-center bg-green-300">{`${fixtureData.score.fulltime.home} - ${fixtureData.score.fulltime.away}`}</div>
                    <div className=" flex flex-row w-auto">
                    <img
                        src={`${fixtureData.teams.away.logo}`}
                        alt="country flag"
                        width={32}
                        height={32}
                        className=" mr-1"
                      />
                      <div className=" pt-1">{fixtureData.teams.away.name}</div>
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
                        width={32}
                        height={32}
                        className=" mr-1"
                      />
                      <div className=" pt-1 truncate">{fixtureData.teams.home.name}</div>
                    </div>
                    <div className=" flex mx-3 w-20 items-center justify-center bg-green-300">{`${fixtureData.score.fulltime.home} - ${fixtureData.score.fulltime.away}`}</div>
                    <div className=" flex flex-row w-auto">
                    <img
                        src={`${fixtureData.teams.away.logo}`}
                        alt="country flag"
                        width={32}
                        height={32}
                        className=" mr-1"
                      />
                      <div className=" pt-1">{fixtureData.teams.away.name}</div>
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
                        width={32}
                        height={32}
                        className=" mr-1"
                      />
                      <div className=" pt-1 truncate ">{fixtureData.teams.home.name}</div>
                      </div>
                    <div className=" flex mx-3 w-20 items-center justify-center bg-green-300">{`${fixtureData.score.fulltime.home} - ${fixtureData.score.fulltime.away}`}</div>
                    <div className=" flex flex-row w-auto">
                    <img
                        src={`${fixtureData.teams.away.logo}`}
                        alt="country flag"
                        width={32}
                        height={32}
                        className=" mr-1"
                      />
                      <div className=" pt-1">{fixtureData.teams.away.name}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
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
      <div className=" flex flex-row justify-center flex-grow ">
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
                            {(!groupedPredictionsData[OptionShortName].every(
                              (predFixture) => predFixture.fixtures.length === 0
                            ) &&
                              <div>{OptionShortName}</div>)}
                          </div>
                          {groupedPredictionsData[OptionShortName].map(
                            (predictedionResult, predResultIndex) => {
                              return predictedionResult.fixtures.map(
                                (fixtureData, fixtureDataIndex) => {
                                  return (
                                    <div
                                      key={`${predResultIndex}-${fixtureDataIndex}`}
                                      className=" cursor-pointer flex flex-row justify-between py-6 my-2 px-3 w-4/6 rounded-md bg-blue-300 hover:bg-blue-200"
                                      onClick={handleFixtureRowClick(
                                        fixtureData
                                      )}
                                    >
                                      <div>
                                        {`${fixtureData.league.name} (${fixtureData.league.country})`}
                                        <div>
                                          {`${toMomentDate(
                                            fixtureData.fixture.date
                                          ).format("DD-MMMM-YYYY HH:mm")}`}
                                        </div>
                                      </div>
                                      <div className=" flex flex-row justify-between w-3/6">
                                        <div className=" flex flex-row">
                                          <img
                                            src={`${fixtureData.teams.home.logo}`}
                                            alt="country flag"
                                            width={40}
                                            height={40}
                                            className=" mr-1"
                                          />
                                          <div className=" flex hover:text-clip text-lg font-semibold items-center justify-center text-black">
                                            {fixtureData.teams.home.name}
                                          </div>
                                        </div>
                                        <div className=" flex justify-start w-1/3">
                                          <div className=" flex flex-row float-left">
                                            <img
                                              src={`${fixtureData.teams.away.logo}`}
                                              alt="country flag"
                                              width={40}
                                              height={40}
                                              className=" mr-1"
                                            />
                                            <div className=" flex hover:text-clip text-lg font-semibold items-center justify-center text-black">
                                              {fixtureData.teams.away.name}
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                      <div className=" flex flex-row justify-center items-center">
                                        <p>{`${predictedionResult.option.shortName}`}</p>
                                      </div>
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
