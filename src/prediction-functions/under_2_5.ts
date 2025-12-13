import { betOptionsEnum } from "../enums/bet-options.enums";
import { betOptionModel } from "../models/bet-option-model";
import { FixtureDataModel } from "../models/fixtures";
import {
  StandingsDataStandingModel,
  StandingsModel,
} from "../models/standings-models";
import { betOptions } from "../variables/variables";
import * as sharedFunctions from "./shared-functions";

export const predictUnder2_5 = ({
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

    // 1) xG: we don't expect either side to go wild
    // both have low-ish attacking expectations (≲ 1 goal each)
    const lowExpectedGoalsForBoth =
      sharedFunctions.teamMax1(homeInputs) && // xG ≤ ~0.8
      sharedFunctions.teamMax1(awayInputs);   // xG ≤ ~0.8

    // 2) Recent totals: mostly 0–2 goals
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

    const recentTotalsMostly0to2 = sharedFunctions.fixtureTotalMinMax({
      fixtures: recentFixturesForTotals,
      minGoals: 0,
      maxGoals: 2,          // UNDER 2.5 = 0,1,2 goals
      occurencePercentage: 60, // ≥ 60% of recent games are 0–2
    });

    // FINAL decision: typical and expected pattern is low scoring
    return lowExpectedGoalsForBoth && recentTotalsMostly0to2;
  });

  return {
    fixtures: predictedFixtures,
    option: betOptions.find(
      (option) => option.id === betOptionsEnum.TOTAL_UNDER_2_5
    ) as betOptionModel,
  };
};
