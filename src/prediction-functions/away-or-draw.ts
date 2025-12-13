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

    const allAwayTeamAwayFixtures =
      sharedFunctions.getAllAwayTeamAwayFixtures({
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

    // --- goal logic using your helpers ---

    // Away has decent to strong attacking potential
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

    // Home is limited in their expected goals (0–2 range)
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

    // Table: away should be clearly stronger (but not as extreme as pure away win)
    const rankDiff = homeTeamStanding.rank - awayTeamStanding.rank; // positive if away is better
    const awayFavoured =
      awayTeamStanding.rank < homeTeamStanding.rank && rankDiff >= 5;

    // H2H: away team avoids losses (home or away roles)
    const awayAvoidsLossInH2H = head2HeadMatches.every((match) => {
      const isCurrentAwayAsHome = match.teams.home.id === currentFixture.teams.away.id;
      const isCurrentAwayAsAway = match.teams.away.id === currentFixture.teams.away.id;

      return (
        (isCurrentAwayAsHome && match.goals.home >= match.goals.away) ||
        (isCurrentAwayAsAway && match.goals.away >= match.goals.home)
      );
    });

    return (
      awayStrongGoals &&
      homeLimitedGoals &&
      awayFavoured &&
      awayAvoidsLossInH2H
    );
  });

  return {
    fixtures: predictedFixtures,
    option: betOptions.find(
      (option) => option.id === betOptionsEnum.AWAY_OR_DRAW
    ) as betOptionModel,
  }; // TODO: can look into making that betoption id a enum
};
