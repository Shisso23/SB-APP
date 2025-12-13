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

    const allHomeTeamHomeFixtures =
      sharedFunctions.getAllHomeTeamHomeFixtures({
        allFixtures,
        currentSeason: currentFixture.league.season,
        teamId: currentFixture.teams.home.id,
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

    const head2HeadMatches = sharedFunctions.getH2HFixtures({
      allFixtures,
      teamOneId: currentFixture.teams.home.id,
      teamTwoId: currentFixture.teams.away.id,
    });

    if (
      allAwayTeamAwayFixtures.length < 3 ||
      allHomeTeamHomeFixtures.length < 3 ||
      !awayTeamStanding ||
      !homeTeamStanding ||
      head2HeadMatches.length === 0
    ) {
      return false;
    }

    const homeTeamAverageGoalsScored =
      sharedFunctions.averageGoalsScoredAtHome({
        homeTeamHomeFixtures: allHomeTeamHomeFixtures,
      });

    const homeTeamAverageGoalsConceded =
      sharedFunctions.averageGoalsConcededAtHome({
        homeTeamHomeFixtures: allHomeTeamHomeFixtures,
      });

    const awayTeamAverageGoalsScored =
      sharedFunctions.averageGoalsScoredAway({
        awayTeamAwayFixtures: allAwayTeamAwayFixtures,
      });

    const awayTeamAverageGoalsConceded =
      sharedFunctions.averageGoalsConcededAway({
        awayTeamAwayFixtures: allAwayTeamAwayFixtures,
      });

    // --- goal logic, using your existing hard-coded helpers ---

    const awayStrongGoals =
      sharedFunctions.teamMin2({
        teamAAverageGoalsScored: awayTeamAverageGoalsScored,
        teamBAverageGoalsConceded: homeTeamAverageGoalsConceded,
      }) ||
      sharedFunctions.teamMin3({
        teamAAverageGoalsScored: awayTeamAverageGoalsScored,
        teamBAverageGoalsConceded: homeTeamAverageGoalsConceded,
      }) ||
      sharedFunctions.teamMin4({
        teamAAverageGoalsScored: awayTeamAverageGoalsScored,
        teamBAverageGoalsConceded: homeTeamAverageGoalsConceded,
      });

    const homeLimitedGoals =
      sharedFunctions.teamMax0({
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
      });

    // away must actually look stronger in the table
    const rankDiff = homeTeamStanding.rank - awayTeamStanding.rank; // positive if away is better
    const awayClearlyStronger =
      awayTeamStanding.rank < homeTeamStanding.rank && rankDiff >= 7;

    return (
      awayStrongGoals &&
      homeLimitedGoals &&
      awayClearlyStronger &&
      sharedFunctions.awayTeamWinsMostMatchesTimes({
        awayTeamId: currentFixture.teams.away.id,
        fixtures: head2HeadMatches,
        winPercentage: 60,
      })
    );
  });

  return {
    fixtures: predictedFixtures,
    option: betOptions.find(
      (option) => option.id === betOptionsEnum.AWAY
    ) as betOptionModel,
  }; // TODO: can look into making that betoption id a enum
};
