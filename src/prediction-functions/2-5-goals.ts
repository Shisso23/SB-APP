import { betOptionsEnum } from "../enums/bet-options.enums";
import { betOptionModel } from "../models/bet-option-model";
import { FixtureDataModel } from "../models/fixtures";
import {
  StandingsDataStandingModel,
  StandingsModel,
} from "../models/standings-models";
import { betOptions } from "../variables/variables";
import * as sharedFunctions from "./shared-functions";

export const predict2_5_goals = ({
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

    // ---- LOWER BOUND: we want "at least 2 goals in the match" to be likely ----
    const atLeastTwoGoalsLikely =
      // one team likely to score 2+ on its own
      sharedFunctions.teamMin2(homeInputs) ||
      sharedFunctions.teamMin2(awayInputs) ||
      // or both teams likely to score at least once
      (sharedFunctions.teamMin1(homeInputs) &&
        sharedFunctions.teamMin1(awayInputs));

    // ---- HISTORY: total goals between 2 and 5 happens often in their games ----
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

    const totalsMostlyBetween2and5 =
      sharedFunctions.fixtureTotalMinMax({
        fixtures: recentFixturesForTotals,
        minGoals: 2,
        maxGoals: 5,          // <= 5 goals
        occurencePercentage: 80, // tweak if you want stricter/looser
      });

    // ---- FINAL RETURN: literally "2–5 goals is the usual and likely outcome" ----
    return atLeastTwoGoalsLikely && totalsMostlyBetween2and5;
  });

  return {
    fixtures: predictedFixtures,
    option: betOptions.find(
      (option) => option.id === betOptionsEnum.TOTAL_2_5_GOALS
    ) as betOptionModel,
  };
};
