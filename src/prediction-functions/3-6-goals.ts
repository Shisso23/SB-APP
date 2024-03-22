import { betOptionsEnum } from "../enums/bet-options.enums";
import { betOptionModel } from "../models/bet-option-model";
import { FixtureDataModel } from "../models/fixtures";
import { StandingsDataStandingModel, StandingsModel } from "../models/standings-models";
import { betOptions } from "../variables/variables";
import * as sharedFunctions from "./shared-functions";


export const predict3_6_goals = ({
    currentFixtures,
    allFixtures,
    leaguesStandings,
  }: {
    currentFixtures: FixtureDataModel[];
    allFixtures: FixtureDataModel[];
    leaguesStandings: StandingsModel[];
  }) => {
    const predictedFixtures = currentFixtures.filter(currentFixture => {
      const allAwayTeamAwayFixtures = sharedFunctions.getAllAwayTeamAwayFixtures({
        allFixtures,
        currentSeason: currentFixture.league.season,
        teamId: currentFixture.teams.away.id,
      });
  
      const allHomeTeamHomeFixtures = sharedFunctions.getAllHomeTeamHomeFixtures({
        allFixtures,
        currentSeason: currentFixture.league.season,
        teamId: currentFixture.teams.home.id,
      });
      if(allAwayTeamAwayFixtures.length <3 || allHomeTeamHomeFixtures.length<3) return false
      const homeTeamAverageGoalsScored = sharedFunctions.averageGoalsScoredAtHome(
        { homeTeamHomeFixtures: allHomeTeamHomeFixtures }
      );
      const homeTeamAverageGoalsConceded =
        sharedFunctions.averageGoalsConcededAtHome({
          homeTeamHomeFixtures: allHomeTeamHomeFixtures,
        });
      const awayTeamAverageGoalsScored = sharedFunctions.averageGoalsScoredAway({
        awayTeamAwayFixtures: allAwayTeamAwayFixtures,
      });
      const awayTeamAverageGoalsConceded =
        sharedFunctions.averageGoalsConcededAway({
          awayTeamAwayFixtures: allAwayTeamAwayFixtures,
        });
  
      return (
       ( (sharedFunctions.teamMin3({
          teamAAverageGoalsScored: awayTeamAverageGoalsScored,
          teamBAverageGoalsConceded: homeTeamAverageGoalsConceded,
        }) ||
          sharedFunctions.teamMin3({
            teamAAverageGoalsScored: homeTeamAverageGoalsScored,
            teamBAverageGoalsConceded: awayTeamAverageGoalsConceded,
          })) || 
          ((sharedFunctions.teamMin1({teamAAverageGoalsScored:awayTeamAverageGoalsScored, teamBAverageGoalsConceded: homeTeamAverageGoalsConceded})) && (sharedFunctions.teamMin2({teamAAverageGoalsScored:homeTeamAverageGoalsScored, teamBAverageGoalsConceded: awayTeamAverageGoalsConceded})))||
          ((sharedFunctions.teamMin2({teamAAverageGoalsScored:awayTeamAverageGoalsScored, teamBAverageGoalsConceded: homeTeamAverageGoalsConceded})) && (sharedFunctions.teamMin1({teamAAverageGoalsScored:homeTeamAverageGoalsScored, teamBAverageGoalsConceded: awayTeamAverageGoalsConceded})))
          ) &&
          (((sharedFunctions.teamMax4({teamAAverageGoalsScored:homeTeamAverageGoalsScored, teamBAverageGoalsConceded: awayTeamAverageGoalsConceded})) &&
          (sharedFunctions.teamMax0({teamAAverageGoalsScored:awayTeamAverageGoalsScored, teamBAverageGoalsConceded: homeTeamAverageGoalsConceded}))) ||
          ((sharedFunctions.teamMax0({teamAAverageGoalsScored:homeTeamAverageGoalsScored, teamBAverageGoalsConceded: awayTeamAverageGoalsConceded})) &&
          (sharedFunctions.teamMax4({teamAAverageGoalsScored:awayTeamAverageGoalsScored, teamBAverageGoalsConceded: homeTeamAverageGoalsConceded}))) ||
          ((sharedFunctions.teamMax1({teamAAverageGoalsScored:homeTeamAverageGoalsScored, teamBAverageGoalsConceded: awayTeamAverageGoalsConceded})) &&
          (sharedFunctions.teamMax4({teamAAverageGoalsScored:awayTeamAverageGoalsScored, teamBAverageGoalsConceded: homeTeamAverageGoalsConceded}))) ||
          ((sharedFunctions.teamMax4({teamAAverageGoalsScored:homeTeamAverageGoalsScored, teamBAverageGoalsConceded: awayTeamAverageGoalsConceded})) &&
          (sharedFunctions.teamMax1({teamAAverageGoalsScored:awayTeamAverageGoalsScored, teamBAverageGoalsConceded: homeTeamAverageGoalsConceded})))||
          ((sharedFunctions.teamMax3({teamAAverageGoalsScored:homeTeamAverageGoalsScored, teamBAverageGoalsConceded: awayTeamAverageGoalsConceded})) &&
          (sharedFunctions.teamMax3({teamAAverageGoalsScored:awayTeamAverageGoalsScored, teamBAverageGoalsConceded: homeTeamAverageGoalsConceded}))) ||
          ((sharedFunctions.teamMax4({teamAAverageGoalsScored:homeTeamAverageGoalsScored, teamBAverageGoalsConceded: awayTeamAverageGoalsConceded})) &&
          (sharedFunctions.teamMax2({teamAAverageGoalsScored:awayTeamAverageGoalsScored, teamBAverageGoalsConceded: homeTeamAverageGoalsConceded})))||
          ((sharedFunctions.teamMax2({teamAAverageGoalsScored:homeTeamAverageGoalsScored, teamBAverageGoalsConceded: awayTeamAverageGoalsConceded})) &&
          (sharedFunctions.teamMax4({teamAAverageGoalsScored:awayTeamAverageGoalsScored, teamBAverageGoalsConceded: homeTeamAverageGoalsConceded}))))
      );
    });
    return {
      fixtures: predictedFixtures,
      option: betOptions.find(option => option.id === betOptionsEnum.TOTAL_3_6_GOALS) as betOptionModel,
    }; 
  };