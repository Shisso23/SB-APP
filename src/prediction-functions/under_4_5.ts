import { betOptionsEnum } from "../enums/bet-options.enums";
import { betOptionModel } from "../models/bet-option-model";
import { FixtureDataModel } from "../models/fixtures";
import {
  StandingsDataStandingModel,
  StandingsModel,
} from "../models/standings-models";
import { betOptions } from "../variables/variables";
import * as sharedFunctions from "./shared-functions";

export const predictUnder4_5 = ({
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
    )
      return false;

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

    // 1) xG: we don't expect a 5+ goal madhouse from either side
    // teamMax3 ≈ "not expecting 4+ goals from this side"
    const lowExpectedGoalsForBoth =
      sharedFunctions.teamMax3(homeInputs) &&
      sharedFunctions.teamMax3(awayInputs);

    // 2) Recent totals: mostly 0–4 goals in their games
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

    const recentTotalsMostly0to4 = sharedFunctions.fixtureTotalMinMax({
      fixtures: recentFixturesForTotals,
      minGoals: 0,
      maxGoals: 4,          // UNDER 4.5 → 0–4 goals
      occurencePercentage: 70, // ≥ 60% of these games end with 0–4 goals
    });

    return lowExpectedGoalsForBoth && recentTotalsMostly0to4;
  });

  return {
    fixtures: predictedFixtures,
    option: betOptions.find(
      (option) => option.id === betOptionsEnum.TOTAL_UNDER_4_5
    ) as betOptionModel,
  };
};
