import { 
    predictOver1_5,
    predictBothTeamsToScore,
    predictHomeWinsEitherHalf, 
    predictAwayWinsEitherHalf, 
    predictHomeWin, predictHomeOver1_5, 
    predictOver2_5, predictMultiGoals2_5, 
    predictMultiGoals3_6, predictBothHalVOver0_5, 
    predictDrawOrGoal, predictDraw, predictHTDraw, 
    predictAwayOver1_5, 
    predictAwayWin, predictHomeOver0_5, 
    predictAwayOver0_5
 } from '../helpers/prediction';
import { betOptionModel } from '../models/bet-option-model';
import { FixtureDataModel } from '../models/fixtures/index';
export const levels: number [] = [0,1,2,3,4,5];

export  const betOptions: betOptionModel [] = [
    {name: 'Both Teams to Score', id: 0, shortName: 'GG', level:3,  predict: (params: {currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=> predictBothTeamsToScore(params)}, 
    {name: 'Home', id: 1, level: 3, shortName: 'Home' , predict: (params: {currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=> predictHomeWin(params)}, 
    {name: 'Home over 1.5', id: 2, level: 3, shortName: 'H.Over 1.5',  predict: (params: {currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=> predictHomeOver1_5(params)},
    {name: 'over 1.5', id: 3, level: 1, shortName: 'Over 1.5',  predict: (params: {currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=> predictOver1_5(params)}, 
    {name: 'Over 2.5', id: 4, level: 2, shortName: 'Over 2.5',  predict: (params: {currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=> predictOver2_5(params)},
    {name: 'Home Wins Either Half', id: 5, level: 1, shortName: 'H.W.E.H' ,  predict: (params: {currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=> predictHomeWinsEitherHalf(params)}, 
    {name: 'Multi Goals (2-5) Goals', id: 6, level: 2, shortName: '2->5 G',  predict: (params: {currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=> predictMultiGoals2_5(params)}, 
    {name: 'Multi Goals (3-6) Goals', id: 7, level: 3, shortName: '3->6 G',  predict: (params: {currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=> predictMultiGoals3_6(params)},
    {name: 'Both Halves Over 0.5', id: 8, level: 4, shortName: 'B.H.Over 0.5',  predict: (params: {currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=> predictBothHalVOver0_5(params)}, 
    {name: 'Draw or GG', id: 9, level: 2, shortName: 'DD OR GG',  predict: (params: {currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=> predictDrawOrGoal(params)}, 
    {name: 'Draw', id: 10, level: 5, shortName: 'DRAW',  predict: (params: {currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=> predictDraw(params)},
    {name: 'Half-Time Draw', id: 11, level: 4, shortName: 'HT-DRAW',  predict: (params: {currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=> predictHTDraw(params)},
    {name: 'Away', id: 12, level: 4, shortName: 'Away',  predict: (params: {currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=> predictAwayWin(params)}, 
    {name: 'Away over 1.5', id: 13, level: 4, shortName: 'A.Over 1.5',  predict: (params: {currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=> predictAwayOver1_5(params)},
    {name: 'Away wins either half', id: 14, level: 2, shortName: 'A.W.E.H',  predict: (params: {currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=> predictAwayWinsEitherHalf(params)},
    {name: 'Home over 0.5', id: 15, level: 0, shortName:'H.Over 0.5',  predict: (params: {currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=> predictHomeOver0_5(params)}, 
    {name: 'Away over 0.5', id: 16, level: 2, shortName:'A.Over 0.5',  predict: (params: {currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=> predictAwayOver0_5(params)}
];

export const numberOfH2HMatchesBack = 5; //TODO Implement this where needed

export const numberOTeamLastFixturesBack = 5; //TODO Implement this where needed

export const numberOfSeasonsBack = 4; //TODO Implement this where needed

export const seasonsBack = [2022, 2021, 2020];

//TODO Should make these constants UPPERCASE


