import { betOptionsEnum } from "../enums/bet-options.enums";
import { betOptionModel } from "../models/bet-option-model";
import { FixtureDataModel } from "../models/fixtures";
import {
  StandingsDataStandingModel,
  StandingsModel,
} from "../models/standings-models";
import { betOptions } from "../variables/variables";
import * as sharedFunctions from "./shared-functions";

export const predictAwayOrDraw = ({
  currentFixtures,
  allFixtures,
  leaguesStandings,
}: {
  currentFixtures: FixtureDataModel[];
  allFixtures: FixtureDataModel[];
  leaguesStandings: StandingsModel[];
}) => {
  const predictedFixtures = currentFixtures.filter((currentFixture) => {
    const lastFiveHomeTeamHomeFixtures =
      sharedFunctions.getLastFiveHomeTeamHomeFixtures({
        teamId: currentFixture.teams.home.id,
        allFixtures,
      });
    const lastFiveAwayTeamAwayFixtures =
      sharedFunctions.getLastFiveAwayTeamAwayFixtures({
        teamId: currentFixture.teams.away.id,
        allFixtures,
      });
    const head2HeadMatches = sharedFunctions.getH2HFixtures({
      allFixtures,
      teamOneId: currentFixture.teams.home.id,
      teamTwoId: currentFixture.teams.away.id,
    });
    const awayTeamStanding: StandingsDataStandingModel =
      sharedFunctions.getAwayTeamStanding({
        standings: leaguesStandings,
        awayTeamId: currentFixture.teams.away.id,
        leagueId: currentFixture.league.id,
      });
    const homeTeamStanding: StandingsDataStandingModel =
      sharedFunctions.getHomeTeamStanding({
        standings: leaguesStandings,
        homeTeamId: currentFixture.teams.home.id,
        leagueId: currentFixture.league.id,
      });
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

    if (
      allAwayTeamAwayFixtures.length < 3 ||
      allHomeTeamHomeFixtures.length < 3 ||
      !awayTeamStanding ||
      !homeTeamStanding ||
      head2HeadMatches.length === 0
    )
      return false;
    //TODO filter the fixtures that passes the H wins either half test here and return it
    return (
      ((sharedFunctions.teamMin2({
        teamAAverageGoalsScored: awayTeamAverageGoalsScored,
        teamBAverageGoalsConceded: homeTeamAverageGoalsConceded,
      }) &&
        sharedFunctions.teamMax0({
          teamAAverageGoalsScored: homeTeamAverageGoalsScored,
          teamBAverageGoalsConceded: awayTeamAverageGoalsConceded,
        })) ||
        (sharedFunctions.teamMin3({
          teamAAverageGoalsScored: awayTeamAverageGoalsScored,
          teamBAverageGoalsConceded: homeTeamAverageGoalsConceded,
        }) &&
          sharedFunctions.teamMax1({
            teamAAverageGoalsScored: homeTeamAverageGoalsScored,
            teamBAverageGoalsConceded: awayTeamAverageGoalsConceded,
          })) ||
        (sharedFunctions.teamMin4({
          teamAAverageGoalsScored: awayTeamAverageGoalsScored,
          teamBAverageGoalsConceded: homeTeamAverageGoalsConceded,
        }) &&
          sharedFunctions.teamMax2({
            teamAAverageGoalsScored: homeTeamAverageGoalsScored,
            teamBAverageGoalsConceded: awayTeamAverageGoalsConceded,
          }))) &&
      awayTeamStanding?.rank < homeTeamStanding?.rank &&
      Math.abs(awayTeamStanding?.rank - homeTeamStanding?.rank) >= 5 &&
      head2HeadMatches.every(
        (match) =>
          (match.goals.home >= match.goals.away &&
            match.teams.home.id === currentFixture.teams.away.id) ||
          (match.goals.away >= match.goals.home &&
            match.teams.away.id === currentFixture.teams.away.id)
      )
    );
  });
  return {
    fixtures: predictedFixtures,
    option: betOptions.find(
      (option) => option.id === betOptionsEnum.AWAY_OR_DRAW
    ) as betOptionModel,
  }; //TODO can look into making that betoption id a enum
};
