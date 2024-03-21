import { betOptionsEnum } from "../enums/bet-options.enums";
import { betOptionModel } from "../models/bet-option-model";
import { FixtureDataModel } from "../models/fixtures";
import {
  StandingsDataStandingModel,
  StandingsModel,
} from "../models/standings-models";
import { betOptions } from "../variables/variables";
import * as sharedFunctions from "./shared-functions";

export const predictAwayWin = ({
  currentFixtures,
  allFixtures,
  leaguesStandings,
}: {
  currentFixtures: FixtureDataModel[];
  allFixtures: FixtureDataModel[];
  leaguesStandings: StandingsModel[];
}) => {
  const predictedFixtures = currentFixtures.filter((currentFixture) => {
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
    if(allAwayTeamAwayFixtures.length <0 || allHomeTeamHomeFixtures.length<5) return false
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
      (sharedFunctions.teamMin1({
        teamAAverageGoalsScored: awayTeamAverageGoalsScored,
        teamBAverageGoalsConceded: homeTeamAverageGoalsConceded,
      }) &&
        sharedFunctions.teamMax0({
          teamAAverageGoalsScored: homeTeamAverageGoalsScored,
          teamBAverageGoalsConceded: awayTeamAverageGoalsConceded,
        })) ||
      (sharedFunctions.teamMin2({
        teamAAverageGoalsScored: awayTeamAverageGoalsScored,
        teamBAverageGoalsConceded: homeTeamAverageGoalsConceded,
      }) &&
        (sharedFunctions.teamMax0({
          teamAAverageGoalsScored: homeTeamAverageGoalsScored,
          teamBAverageGoalsConceded: awayTeamAverageGoalsConceded,
        }) ||
          sharedFunctions.teamMax1({
            teamAAverageGoalsScored: homeTeamAverageGoalsScored,
            teamBAverageGoalsConceded: awayTeamAverageGoalsConceded,
          }))) ||
      (sharedFunctions.teamMin3({
        teamAAverageGoalsScored: awayTeamAverageGoalsScored,
        teamBAverageGoalsConceded: homeTeamAverageGoalsConceded,
      }) &&
        (sharedFunctions.teamMax0({
          teamAAverageGoalsScored: homeTeamAverageGoalsScored,
          teamBAverageGoalsConceded: awayTeamAverageGoalsConceded,
        }) ||
          sharedFunctions.teamMax1({
            teamAAverageGoalsScored: homeTeamAverageGoalsScored,
            teamBAverageGoalsConceded: awayTeamAverageGoalsConceded,
          }) ||
          sharedFunctions.teamMax2({
            teamAAverageGoalsScored: homeTeamAverageGoalsScored,
            teamBAverageGoalsConceded: awayTeamAverageGoalsConceded,
          }))) ||
          (sharedFunctions.teamMin4({
            teamAAverageGoalsScored: awayTeamAverageGoalsScored,
            teamBAverageGoalsConceded: homeTeamAverageGoalsConceded,
          }) &&
            (sharedFunctions.teamMax0({
              teamAAverageGoalsScored: homeTeamAverageGoalsScored,
              teamBAverageGoalsConceded: awayTeamAverageGoalsConceded,
            }) ||
              sharedFunctions.teamMax1({
                teamAAverageGoalsScored: homeTeamAverageGoalsScored,
                teamBAverageGoalsConceded: awayTeamAverageGoalsConceded,
              }) ||
              sharedFunctions.teamMax2({
                teamAAverageGoalsScored: homeTeamAverageGoalsScored,
                teamBAverageGoalsConceded: awayTeamAverageGoalsConceded,
              })))
    );
  });
  return {
    fixtures: predictedFixtures,
    option: betOptions.find(
      (option) => option.id === betOptionsEnum.AWAY
    ) as betOptionModel,
  }; //TODO can look into making that betoption id a enum
};
