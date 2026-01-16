import { betOptionsEnum } from "../enums/bet-options.enums";
import { betOptionModel } from "../models/bet-option-model";
import { FixtureDataModel } from "../models/fixtures";
import { StandingsModel, StandingsDataStandingModel } from "../models/standings-models";
import { betOptions } from "../variables/variables";
import * as sharedFunctions from "./shared-functions";

export const predictMultiGoals0_3 = ({
  currentFixtures,
  allFixtures,
  leaguesStandings,
}: {
  currentFixtures: FixtureDataModel[];
  allFixtures: FixtureDataModel[];
  leaguesStandings: StandingsModel[];
}) => {
  const predictedFixtures = currentFixtures.filter((currentFixture) => {
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

    const head2HeadMatches = sharedFunctions.getH2HFixtures({
      allFixtures,
      teamOneId: currentFixture.teams.home.id,
      teamTwoId: currentFixture.teams.away.id,
    });

    if (
      allAwayTeamAwayFixtures.length < 3 ||
      allHomeTeamHomeFixtures.length < 3 ||
      head2HeadMatches.length === 0
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

    // 1) Expected goals: both teams look low-to-moderate in attack
    const lowExpectedGoalsForBoth =
      sharedFunctions.teamMax2(homeInputs) &&
      sharedFunctions.teamMax2(awayInputs);

    // 2) Recent fixtures: mostly 0–3 total goals
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

    const recentFixturesForTotals = [
      ...lastFiveHomeTeamHomeFixtures,
      ...lastFiveAwayTeamAwayFixtures,
    ];

    const recentTotalsMostly0to3 =
      sharedFunctions.fixtureTotalMinMax({
        fixtures: recentFixturesForTotals,
        minGoals: 0,
        maxGoals: 3,
        occurencePercentage: 70, // e.g. at least 60% of those games end 0–3 goals
      });

    // 3) H2H: low scoring historically (every game 0–3 goals)
    const h2hLowScoring = head2HeadMatches.every((match) => {
      const total = match.goals.home + match.goals.away;
      return total <= 3;
    });

    // FINAL: match is typically low scoring and looks low scoring on paper
    return lowExpectedGoalsForBoth && recentTotalsMostly0to3 && h2hLowScoring;
  });

  return {
    fixtures: predictedFixtures,
    option: betOptions.find(
      (option) => option.id === betOptionsEnum.TOTAL_0_3_GOALS
    ) as betOptionModel,
  }; // can look into making that betoption a enum
};
