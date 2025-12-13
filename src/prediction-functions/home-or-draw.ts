import { betOptionsEnum } from "../enums/bet-options.enums";
import { betOptionModel } from "../models/bet-option-model";
import { FixtureDataModel } from "../models/fixtures";
import {
  StandingsDataStandingModel,
  StandingsModel,
} from "../models/standings-models";
import { betOptions } from "../variables/variables";
import * as sharedFunctions from "./shared-functions";

export const predictHomeOrDraw = ({
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

    const head2HeadMatches = sharedFunctions.getH2HFixtures({
      allFixtures,
      teamOneId: currentFixture.teams.home.id,
      teamTwoId: currentFixture.teams.away.id,
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
      !homeTeamStanding
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

    // Home has decent to strong attacking potential
    const homeStrongGoals =
      sharedFunctions.teamMin2({
        teamAAverageGoalsScored: homeTeamAverageGoalsScored,
        teamBAverageGoalsConceded: awayTeamAverageGoalsConceded,
      }) ||
      sharedFunctions.teamMin3({
        teamAAverageGoalsScored: homeTeamAverageGoalsScored,
        teamBAverageGoalsConceded: awayTeamAverageGoalsConceded,
      }) ||
      sharedFunctions.teamMin4({
        teamAAverageGoalsScored: homeTeamAverageGoalsScored,
        teamBAverageGoalsConceded: awayTeamAverageGoalsConceded,
      });

    // Away not expected to run riot (0–2 goals range)
    const awayLimitedGoals =
      sharedFunctions.teamMax0({
        teamAAverageGoalsScored: awayTeamAverageGoalsScored,
        teamBAverageGoalsConceded: homeTeamAverageGoalsConceded,
      }) ||
      sharedFunctions.teamMax1({
        teamAAverageGoalsScored: awayTeamAverageGoalsScored,
        teamBAverageGoalsConceded: homeTeamAverageGoalsConceded,
      }) ||
      sharedFunctions.teamMax2({
        teamAAverageGoalsScored: awayTeamAverageGoalsScored,
        teamBAverageGoalsConceded: homeTeamAverageGoalsConceded,
      });

    // Table: home should be clearly stronger (but not as strict as pure home win)
    const rankDiff = awayTeamStanding.rank - homeTeamStanding.rank; // positive if home is better
    const homeFavoured =
      homeTeamStanding.rank < awayTeamStanding.rank && rankDiff > 3;

    // H2H: home team avoids losses in previous meetings (home or away)
    const homeAvoidsLossInH2H = head2HeadMatches.every((match) => {
      const isCurrentHomeAsHome = match.teams.home.id === currentFixture.teams.home.id;
      const isCurrentHomeAsAway = match.teams.away.id === currentFixture.teams.home.id;

      return (
        (isCurrentHomeAsHome && match.goals.home >= match.goals.away) ||
        (isCurrentHomeAsAway && match.goals.away >= match.goals.home)
      );
    });

    return (
      homeStrongGoals &&
      awayLimitedGoals &&
      homeFavoured &&
      homeAvoidsLossInH2H
    );
  });

  return {
    fixtures: predictedFixtures,
    option: betOptions.find(
      (option) => option.id === betOptionsEnum.HOME_OR_DRAW
    ) as betOptionModel,
  };
};
