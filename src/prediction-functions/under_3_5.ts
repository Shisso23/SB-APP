import { betOptionsEnum } from "../enums/bet-options.enums";
import { betOptionModel } from "../models/bet-option-model";
import { FixtureDataModel } from "../models/fixtures";
import {
  StandingsDataStandingModel,
  StandingsModel,
} from "../models/standings-models";
import { betOptions } from "../variables/variables";
import * as sharedFunctions from "./shared-functions";

export const predictUnder3_5 = ({
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

    if (
      allAwayTeamAwayFixtures.length < 3 ||
      allHomeTeamHomeFixtures.length < 3
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

    const homeInputs = {
      teamAAverageGoalsScored: homeTeamAverageGoalsScored,
      teamBAverageGoalsConceded: awayTeamAverageGoalsConceded,
    };

    const awayInputs = {
      teamAAverageGoalsScored: awayTeamAverageGoalsScored,
      teamBAverageGoalsConceded: homeTeamAverageGoalsConceded,
    };

    // 1) xG: overall we don't expect a crazy high-scoring game
    const lowExpectedGoalsForBoth =
      sharedFunctions.teamMax2(homeInputs) &&   // home xG ≲ 2
      sharedFunctions.teamMax2(awayInputs);    // away xG ≲ 2

    // 2) Recent history: totals usually 0–3 goals
    const lastFiveHomeHomeFixtures =
      sharedFunctions.getLastFiveHomeTeamHomeFixtures({
        teamId: currentFixture.teams.home.id,
        allFixtures,
      });

    const lastFiveAwayAwayFixtures =
      sharedFunctions.getLastFiveAwayTeamAwayFixtures({
        teamId: currentFixture.teams.away.id,
        allFixtures,
      });

    const recentFixturesForTotals = [
      ...lastFiveHomeHomeFixtures,
      ...lastFiveAwayAwayFixtures,
    ];

    const recentTotalsMostly0to3 =
      sharedFunctions.fixtureTotalMinMax({
        fixtures: recentFixturesForTotals,
        minGoals: 0,
        maxGoals: 3,          // UNDER 3.5 → totals 0,1,2,3
        occurencePercentage: 60, // at least 60% of these are 0–3 goals
      });

    // FINAL: both the model and history say "this tends to be a low/medium scoring game"
    return lowExpectedGoalsForBoth && recentTotalsMostly0to3;
  });

  return {
    fixtures: predictedFixtures,
    option: betOptions.find(
      (option) => option.id === betOptionsEnum.TOTAL_UNDER_3_5
    ) as betOptionModel,
  };
};
