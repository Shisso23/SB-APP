import { betOptionsEnum } from "../enums/bet-options.enums";
import { betOptionModel } from "../models/bet-option-model";
import { FixtureDataModel } from "../models/fixtures";
import {
  StandingsDataStandingModel,
  StandingsModel,
} from "../models/standings-models";
import { betOptions } from "../variables/variables";
import * as sharedFunctions from "./shared-functions";

export const predictOver2_5 = ({
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

    const head2HeadMatches = sharedFunctions.getH2HFixtures({
      allFixtures,
      teamOneId: currentFixture.teams.home.id,
      teamTwoId: currentFixture.teams.away.id,
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

    const homeInputs = {
      teamAAverageGoalsScored: homeTeamAverageGoalsScored,
      teamBAverageGoalsConceded: awayTeamAverageGoalsConceded,
    };

    const awayInputs = {
      teamAAverageGoalsScored: awayTeamAverageGoalsScored,
      teamBAverageGoalsConceded: homeTeamAverageGoalsConceded,
    };

    // 1) xG logic: "3+ goals in the match are likely"
    const atLeastThreeGoalsLikely =
      // one team likely to hit 3+ on its own
      sharedFunctions.teamMin3(homeInputs) ||
      sharedFunctions.teamMin3(awayInputs) ||
      // or combos like 2+1 or 1+2
      (sharedFunctions.teamMin2(homeInputs) &&
        sharedFunctions.teamMin1(awayInputs)) ||
      (sharedFunctions.teamMin1(homeInputs) &&
        sharedFunctions.teamMin2(awayInputs));

    // 2) Recent form: avoid teams that are constantly 0 goals
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

    const homeRarelyBlank = sharedFunctions.homeHasAtMostNoScoreGames({
      homefixtures: lastFiveHomeHomeFixtures,
      maxNoScoreGames: 1, // at most 1 home blank in last N
    });

    const awayRarelyBlank = sharedFunctions.awayHasAtMostNoScoreGames({
      awayfixtures: lastFiveAwayAwayFixtures,
      maxNoScoreGames: 1, // at most 1 away blank in last N
    });

    // 3) History: totals usually 3+ goals
    const recentFixturesForTotals = [
      ...lastFiveHomeHomeFixtures,
      ...lastFiveAwayAwayFixtures,
    ];

    const recentMostlyOver25 = sharedFunctions.fixtureTotalMinMax({
      fixtures: recentFixturesForTotals,
      minGoals: 3,
      maxGoals: 10,          // we don't care about the upper side for O2.5
      occurencePercentage: 60, // ≥ 60% of those games have 3+ goals
    });

    const h2hMostlyOver25 = sharedFunctions.fixtureTotalMinMax({
      fixtures: head2HeadMatches,
      minGoals: 3,
      maxGoals: 10,
      occurencePercentage: 60, // tweak if you want stricter
    });

    return (
      atLeastThreeGoalsLikely &&
      homeRarelyBlank &&
      awayRarelyBlank &&
      recentMostlyOver25 &&
      h2hMostlyOver25
    );
  });

  return {
    fixtures: predictedFixtures,
    option: betOptions.find(
      (option) => option.id === betOptionsEnum.OVER_2_5
    ) as betOptionModel,
  };
};
