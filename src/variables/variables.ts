import { betOptionsEnum } from "../enums/bet-options.enums";
import { betOptionModel } from "../models/bet-option-model";
import { FixtureDataModel } from "../models/fixtures/index";
import { StandingsModel } from "../models/standings-models/index";
import predictionFunctions from "../prediction-functions";
export const levels: number[] = [0, 1, 2, 3, 4, 5];

export const betOptions: betOptionModel[] = [
  {
    name: "Both Teams to Score",
    id: 0,
    shortName: "GG",
    level: 3,
    description: "Both teams score at least 1 goal",
    predict: (params: {
      currentFixtures: FixtureDataModel[];
      allFixtures: FixtureDataModel[];
      leaguesStandings: StandingsModel[];
    }) => predictionFunctions.predictBothTeamsToScore(params),
  },
  {
    name: "Home",
    id: 1,
    level: 3,
    shortName: "Home",
    description: "Home team to win",
    predict: (params: {
      currentFixtures: FixtureDataModel[];
      allFixtures: FixtureDataModel[];
      leaguesStandings: StandingsModel[];
    }) => predictionFunctions.predictHomeWin(params),
  },
  {
    name: "Home over 1.5",
    id: 2,
    level: 3,
    shortName: "H.Over 1.5",
    description: "Home team scores at least 2 goals",
    predict: (params: {
      currentFixtures: FixtureDataModel[];
      allFixtures: FixtureDataModel[];
      leaguesStandings: StandingsModel[];
    }) => predictionFunctions.predictHomeOver1_5(params),
  },
  {name: 'over 1.5', id: 3, level: 1, shortName: 'Over 1.5', description: '2 goals or more in the match',   predict: (params: {currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[], leaguesStandings: StandingsModel[]})=> predictionFunctions.predictOver1_5(params)},
  {name: 'Over 2.5', id: 4, level: 2, shortName: 'Over 2.5', description: '3 goals or more in the match',   predict: (params: {currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[], leaguesStandings: StandingsModel[]})=> predictionFunctions.predictOver2_5(params)},
  // {
  //   name: "Home Wins Either Half",
  //   id: 5,
  //   level: 1,
  //   shortName: "H.W.E.H",
  //   description: "Home team wins either half",
  //   predict: (params: {
  //     currentFixtures: FixtureDataModel[];
  //     allFixtures: FixtureDataModel[];
  //     leaguesStandings: StandingsModel[];
  //   }) => predictionFunctions.predictHomeWinsEitherHalf(params),
  // },
  // {name: 'Multi Goals (2-5) Goals', id: 6, level: 2, shortName: '2->5 G', description: '',   predict: (params: {currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[], leaguesStandings: StandingsModel[]})=> predictionFunctions.predict2_5_goals(params)},
  {name: 'Multi Goals (3-6) Goals', id: 7, level: 3, shortName: '3->6 G', description: '',   predict: (params: {currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[], leaguesStandings: StandingsModel[]})=> predictionFunctions.predict3_6_goals(params)},
  // {name: 'Both Halves Over 0.5', id: 8, level: 4, shortName: 'B.H.Over 0.5', description: '',   predict: (params: {currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[], leaguesStandings: StandingsModel[]})=> predictBothHalVOver0_5(params)},
  //  {name: 'Draw or GG', id: 9, level: 2, shortName: 'DD OR GG', description: '',   predict: (params: {currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[], leaguesStandings: StandingsModel[]})=> predictDrawOrGoal(params)},
  // {
  //   name: "Draw",
  //   id: 10,
  //   level: 5,
  //   shortName: "DRAW",
  //   description: "Draw. No winner, No loser",
  //   predict: (params: {
  //     currentFixtures: FixtureDataModel[];
  //     allFixtures: FixtureDataModel[];
  //     leaguesStandings: StandingsModel[];
  //   }) => predictionFunctions.predictDraw(params),
  // },
  // {name: 'Half-Time Draw', id: 11, level: 4, shortName: 'HT-DRAW', description: '',   predict: (params: {currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[], leaguesStandings: StandingsModel[]})=> predictionFunctions.predictHTDraw(params)},
  {
    name: "Away",
    id: 12,
    level: 4,
    shortName: "Away",
    description: "Away team to win",
    predict: (params: {
      currentFixtures: FixtureDataModel[];
      allFixtures: FixtureDataModel[];
      leaguesStandings: StandingsModel[];
    }) => predictionFunctions.predictAwayWin(params),
  },
  {
    name: "Away over 1.5",
    id: 13,
    level: 4,
    shortName: "A.Over 1.5",
    description: "Away team scores at least 2 goals",
    predict: (params: {
      currentFixtures: FixtureDataModel[];
      allFixtures: FixtureDataModel[];
      leaguesStandings: StandingsModel[];
    }) => predictionFunctions.predictAwayOver1_5(params),
  },
  // {
  //   name: "Away wins either half",
  //   id: 14,
  //   level: 2,
  //   shortName: "A.W.E.H",
  //   description: "Away team wins either half",
  //   predict: (params: {
  //     currentFixtures: FixtureDataModel[];
  //     allFixtures: FixtureDataModel[];
  //     leaguesStandings: StandingsModel[];
  //   }) => predictionFunctions.predictAwayWinsEitherHalf(params),
  // },
  {
    name: "Home over 0.5",
    id: 15,
    level: 0,
    shortName: "H.Over 0.5",
    description: "Home team scores at least once",
    predict: (params: {
      currentFixtures: FixtureDataModel[];
      allFixtures: FixtureDataModel[];
      leaguesStandings: StandingsModel[];
    }) => predictionFunctions.predictHomeOver0_5(params),
  },
  {
    name: "Away over 0.5",
    id: 16,
    level: 2,
    shortName: "A.Over 0.5",
    description: "Away team scores at least once",
    predict: (params: {
      currentFixtures: FixtureDataModel[];
      allFixtures: FixtureDataModel[];
      leaguesStandings: StandingsModel[];
    }) => predictionFunctions.predictAwayOver0_5(params),
  },
  //  {name: 'Multi Goals (2->4 ) Goals', id: 17, level: 3, shortName:'2->4 G', description: '2 to 4 goals in total score',   predict: (params: {currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[], leaguesStandings: StandingsModel[]})=> predictionFunctions.predict2_4_goals(params)},
  // {
  //   name: "Multi Goals (0->2 ) Goals",
  //   id: 18,
  //   level: 3,
  //   shortName: "0->2 G",
  //   description: "0 to 2 goals in total score",
  //   predict: (params: {
  //     currentFixtures: FixtureDataModel[];
  //     allFixtures: FixtureDataModel[];
  //     leaguesStandings: StandingsModel[];
  //   }) => predictMultiGoals0_2(params),
  // },
  {
    name: "Multi Goals (0->3 ) Goals",
    id: 19,
    level: 2,
    shortName: "0->3 G",
    description: "0 to 3 goals in total score",
    predict: (params: {
      currentFixtures: FixtureDataModel[];
      allFixtures: FixtureDataModel[];
      leaguesStandings: StandingsModel[];
    }) => predictionFunctions.predictMultiGoals0_3(params),
  },
  // {
  //   name: "Multi Goals H. (1->2 ) Goals",
  //   id: 20,
  //   level: 3,
  //   shortName: "1->2 H. G",
  //   description: "Home team scores 1 or 2 goals",
  //   predict: (params: {
  //     currentFixtures: FixtureDataModel[];
  //     allFixtures: FixtureDataModel[];
  //     leaguesStandings: StandingsModel[];
  //   }) => predictionFunctions.predict1_2_goals_Home(params),
  // },
  // {name: 'Multi Goals H. (1->3 ) Goals', id: 21, level: 0, shortName:'1->3 H. G', description: '',   predict: (params: {currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[], leaguesStandings: StandingsModel[]})=> predictMultiGoals1_3Home(params)},
  // {
  //   name: "Multi Goals H. (2->3 ) Goals",
  //   id: 22,
  //   level: 4,
  //   shortName: "2->3 H. G",
  //   description: "Home team scores 2 or 3 goals",
  //   predict: (params: {
  //     currentFixtures: FixtureDataModel[];
  //     allFixtures: FixtureDataModel[];
  //     leaguesStandings: StandingsModel[];
  //   }) => predictionFunctions.predict2_3_goals_Home(params),
  // },
  // {
  //   name: "Multi Goals A. (1->2 ) Goals",
  //   id: 23,
  //   level: 3,
  //   shortName: "1->2 A. G",
  //   description: "Away team scores 1 or 2 goals",
  //   predict: (params: {
  //     currentFixtures: FixtureDataModel[];
  //     allFixtures: FixtureDataModel[];
  //     leaguesStandings: StandingsModel[];
  //   }) => predictionFunctions.predict1_2_goals_Away(params),
  // },
  // {
  //   name: "Multi Goals A. (2->3 ) Goals",
  //   id: 24,
  //   level: 4,
  //   shortName: "2->3 A. G",
  //   description: "Away team scores 2 or 3 goals",
  //   predict: (params: {
  //     currentFixtures: FixtureDataModel[];
  //     allFixtures: FixtureDataModel[];
  //     leaguesStandings: StandingsModel[];
  //   }) => predictionFunctions.predict2_3_goals_Away(params),
  // },
  // {name: 'Multi Goals A. (1->3 ) Goals', id: 25, level: 0, shortName:'1->3 A. G', description: '',   predict: (params: {currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[], leaguesStandings: StandingsModel[]})=> predictMultiGoals1_3Away(params)},
  {
    name: "Home or Draw",
    id: 26,
    level: 1,
    shortName: "Home or Dr.",
    description: "Home team wins or draw",
    predict: (params: {
      currentFixtures: FixtureDataModel[];
      allFixtures: FixtureDataModel[];
      leaguesStandings: StandingsModel[];
    }) => predictionFunctions.predictHomeOrDraw(params),
  },
  {
    name: "Away or Draw",
    id: 27,
    level: 1,
    shortName: "Away or Dr.",
    description: "Away team wins or draw",
    predict: (params: {
      currentFixtures: FixtureDataModel[];
      allFixtures: FixtureDataModel[];
      leaguesStandings: StandingsModel[];
    }) => predictionFunctions.predictAwayOrDraw(params),
  },
  // {
  //   name: "Home Clean sheet",
  //   id: 28,
  //   level: 3,
  //   shortName: "Cleansheet home",
  //   description: "Home team will not concede a goal",
  //   predict: (params: {
  //     currentFixtures: FixtureDataModel[];
  //     allFixtures: FixtureDataModel[];
  //     leaguesStandings: StandingsModel[];
  //   }) => predictHomeCleanSheet(params),
  // },
  // {
  //   name: "Away Clean sheet",
  //   id: 29,
  //   level: 3,
  //   shortName: "Cleansheet away",
  //   description: "Away team will not concede a goal",
  //   predict: (params: {
  //     currentFixtures: FixtureDataModel[];
  //     allFixtures: FixtureDataModel[];
  //     leaguesStandings: StandingsModel[];
  //   }) => predictAwayCleanSheet(params),
  // },

  {
    name: "Under 5.5",
    id: betOptionsEnum.UNDER_5_5,
    level: 1,
    shortName: "Under 6 goals",
    description: "Under 6 goals",
    predict: (params: {
      currentFixtures: FixtureDataModel[];
      allFixtures: FixtureDataModel[];
      leaguesStandings: StandingsModel[];
    }) => predictionFunctions.predictUnder5_5(params),
  },
  {
    name: "Over 0.5",
    id: betOptionsEnum.OVER_0_5,
    level: 1,
    shortName: "Over 0.5",
    description: "At least 1 goal in the match",
    predict: (params: {
      currentFixtures: FixtureDataModel[];
      allFixtures: FixtureDataModel[];
      leaguesStandings: StandingsModel[];
    }) => predictionFunctions.predictOver0_5(params),
  },
];

export const numberOfH2HMatchesBack = 5;

export const numberOTeamLastFixturesBack = 5;

export const numberOfSeasonsBack = 3;

export const seasonsBack = [2023,2022, 2021]; // modify this to work better. SHould not be hardcorded. Adding 2023 in janury gave me issues

//TODO Should make these constants UPPERCASE
