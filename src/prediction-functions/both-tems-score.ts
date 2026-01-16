import { betOptionsEnum } from "../enums/bet-options.enums";
import { betOptionModel } from "../models/bet-option-model";
import { FixtureDataModel } from "../models/fixtures";
import {
  StandingsDataStandingModel,
  StandingsModel,
} from "../models/standings-models";
import { betOptions } from "../variables/variables";
import * as sharedFunctions from "./shared-functions";

export const predictBothTeamsToScore = ({
  currentFixtures,
  allFixtures,
  leaguesStandings,
}: {
  currentFixtures: FixtureDataModel[];
  allFixtures: FixtureDataModel[];
  leaguesStandings: StandingsModel[];
}) => {
  const predictedFixtures = currentFixtures.filter((currentFixture) => {
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
    const head2HeadMatches = sharedFunctions.getH2HFixtures({
      allFixtures,
      teamOneId: currentFixture.teams.home.id,
      teamTwoId: currentFixture.teams.away.id,
    });
    const allHomeTeamHomeFixtures = sharedFunctions.getAllHomeTeamHomeFixtures({
      allFixtures,
      currentSeason: currentFixture.league.season,
      teamId: currentFixture.teams.home.id,
    });
    if (
      allAwayTeamAwayFixtures.length < 3 ||
      allHomeTeamHomeFixtures.length < 3 ||
      head2HeadMatches.length === 0 ||
      !homeTeamStanding ||
      !awayTeamStanding
    )
      return false;
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
    const lastFiveHomeTeamHomeFixtures =
      sharedFunctions.getLastFiveHomeTeamHomeFixtures({
        allFixtures,
        teamId: currentFixture.teams.home.id,
      });
    const lastFiveAwayTeamAwayFixtures =
      sharedFunctions.getLastFiveAwayTeamAwayFixtures({
        allFixtures,
        teamId: currentFixture.teams.away.id,
      });

    return (
      // awayTeamStanding?.rank < homeTeamStanding?.rank &&
      // homeTeamStanding?.rank - awayTeamStanding?.rank >= 5 &&
      sharedFunctions.teamMin1({
        teamAAverageGoalsScored: homeTeamAverageGoalsScored,
        teamBAverageGoalsConceded: awayTeamAverageGoalsConceded,
      }) &&
      sharedFunctions.teamMin1({
        teamAAverageGoalsScored: awayTeamAverageGoalsScored,
        teamBAverageGoalsConceded: homeTeamAverageGoalsConceded,
      }) && 
      sharedFunctions.awayHasAtMostNoScoreGames({
        awayfixtures: allAwayTeamAwayFixtures,
        maxNoScoreGames: 0
      }) &&
      sharedFunctions.homeHasAtMostNoScoreGames({
        homefixtures: allHomeTeamHomeFixtures,
        maxNoScoreGames: 0
      })
    );
  });
  return {
    fixtures: predictedFixtures,
    option: betOptions.find(
      (option) => option.id === betOptionsEnum.BOTH_TEAMS_TO_SCORE
    ) as betOptionModel,
  };
};
