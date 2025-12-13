import { betOptionsEnum } from "../enums/bet-options.enums";
import { betOptionModel } from "../models/bet-option-model";
import { FixtureDataModel } from "../models/fixtures";
import {
  StandingsDataStandingModel,
  StandingsModel,
} from "../models/standings-models";
import { betOptions } from "../variables/variables";
import sharedFunctions, {
  getLastFiveHomeTeamHomeFixtures,
  getLastFiveAwayTeamAwayFixtures,
  getH2HFixtures,
  getAwayTeamStanding,
  getHomeTeamStanding,
  fixtureTotalMinMax,
  homeTeamWinsMostMatches,
  awayTeamWinsMostMatchesTimes,
  // xG-based helpers:
  teamMax1,
  teamMax2,
} from "./shared-functions";

export const predictDraw = ({
  currentFixtures,
  allFixtures,
  leaguesStandings,
}: {
  currentFixtures: FixtureDataModel[];
  allFixtures: FixtureDataModel[];
  leaguesStandings: StandingsModel[];
}) => {
  const predictedFixtures = currentFixtures.filter((currentFixture) => {
    const lastFiveHomeTeamHomeFixtures = getLastFiveHomeTeamHomeFixtures({
      teamId: currentFixture.teams.home.id,
      allFixtures,
    });

    const lastFiveAwayTeamAwayFixtures = getLastFiveAwayTeamAwayFixtures({
      teamId: currentFixture.teams.away.id,
      allFixtures,
    });

    const fixtureH2hFixtures = getH2HFixtures({
      teamOneId: currentFixture.teams.home.id,
      teamTwoId: currentFixture.teams.away.id,
      allFixtures,
    });

    const homeTeamStanding: StandingsDataStandingModel = getHomeTeamStanding({
      standings: leaguesStandings,
      homeTeamId: currentFixture.teams.home.id,
      leagueId: currentFixture.league.id,
    });

    const awayTeamStanding: StandingsDataStandingModel = getAwayTeamStanding({
      standings: leaguesStandings,
      awayTeamId: currentFixture.teams.away.id,
      leagueId: currentFixture.league.id,
    });

    if (
      lastFiveAwayTeamAwayFixtures.length < 3 ||
      lastFiveHomeTeamHomeFixtures.length < 3 ||
      fixtureH2hFixtures.length < 3 ||
      !homeTeamStanding ||
      !awayTeamStanding
    ) {
      return false;
    }

    // --- xG-style inputs for min/max helpers ---
    const homeAvgScored = sharedFunctions.averageGoalsScoredAtHome({
      homeTeamHomeFixtures: lastFiveHomeTeamHomeFixtures,
    });
    const homeAvgConceded = sharedFunctions.averageGoalsConcededAtHome({
      homeTeamHomeFixtures: lastFiveHomeTeamHomeFixtures,
    });
    const awayAvgScored = sharedFunctions.averageGoalsScoredAway({
      awayTeamAwayFixtures: lastFiveAwayTeamAwayFixtures,
    });
    const awayAvgConceded = sharedFunctions.averageGoalsConcededAway({
      awayTeamAwayFixtures: lastFiveAwayTeamAwayFixtures,
    });

    const homeInputs = {
      teamAAverageGoalsScored: homeAvgScored,
      teamBAverageGoalsConceded: awayAvgConceded,
    };

    const awayInputs = {
      teamAAverageGoalsScored: awayAvgScored,
      teamBAverageGoalsConceded: homeAvgConceded,
    };

    // 1) Balanced table strength
    const rankDiff = Math.abs(homeTeamStanding.rank - awayTeamStanding.rank);
    const balancedStrength = rankDiff <= 4; // tweakable (3–5)

    // 2) xG: both teams look low–medium, not explosive
    // teamMax2 ≈ "we don't expect 3+ from this side"
    // teamMax1 ≈ "we don't even expect 2+ from this side"
    const lowToMediumExpectedGoals =
      teamMax2(homeInputs) && teamMax2(awayInputs);

    // 3) Recent totals: mostly tight 0–3 games
    const recentFixturesForTotals = [
      ...lastFiveHomeTeamHomeFixtures,
      ...lastFiveAwayTeamAwayFixtures,
    ];

    const recentTotalsMostly0to3 = fixtureTotalMinMax({
      fixtures: recentFixturesForTotals,
      minGoals: 0,
      maxGoals: 3,        // 0–3 goals → classic draw territory
      occurencePercentage: 60, // at least 60% of these
    });

    const h2hTotalsMostly0to3 = fixtureTotalMinMax({
      fixtures: fixtureH2hFixtures,
      minGoals: 0,
      maxGoals: 3,
      occurencePercentage: 60,
    });

    // 4) No side dominates H2H (we don't want a clear “better” team)
    const homeDominatesH2H = homeTeamWinsMostMatches({
      fixtures: fixtureH2hFixtures,
      homeTeamId: currentFixture.teams.home.id,
      winPercentage: 60, // true if home has ≥60% wins
    });

    const awayDominatesH2H = awayTeamWinsMostMatchesTimes({
      fixtures: fixtureH2hFixtures,
      awayTeamId: currentFixture.teams.away.id,
      winPercentage: 60,
    });

    const noClearH2HDominance = !homeDominatesH2H && !awayDominatesH2H;

    // FINAL: tight game profile in xG + history, balanced strength, no bully in H2H
    return (
      balancedStrength &&
      lowToMediumExpectedGoals &&
      recentTotalsMostly0to3 &&
      h2hTotalsMostly0to3 &&
      noClearH2HDominance
    );
  });

  return {
    fixtures: predictedFixtures,
    option: betOptions.find(
      (option) => option.id === betOptionsEnum.DRAW
    ) as betOptionModel,
  };
};
