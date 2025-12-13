import { betOptionsEnum } from "../enums/bet-options.enums";
import { betOptionModel } from "../models/bet-option-model";
import { FixtureDataModel } from "../models/fixtures";
import {
  StandingsDataStandingModel,
  StandingsModel,
} from "../models/standings-models";
import { betOptions } from "../variables/variables";
import * as sharedFunctions from "./shared-functions";

export const predictOver1_5 = ({
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

    const head2HeadMatches = sharedFunctions.getH2HFixtures({
      allFixtures,
      teamOneId: currentFixture.teams.home.id,
      teamTwoId: currentFixture.teams.away.id,
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

    // 1) xG logic: "at least 2 goals are likely"
    const atLeastTwoGoalsLikely =
      // one team likely to score 2+ alone
      sharedFunctions.teamMin2(homeInputs) ||
      sharedFunctions.teamMin2(awayInputs) ||
      // or both likely to get 1+
      (sharedFunctions.teamMin1(homeInputs) &&
        sharedFunctions.teamMin1(awayInputs));

    // 2) Recent form: avoid teams that blank all the time
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
      maxNoScoreGames: 1, // at most 1 game with 0 goals in last N home games
    });

    const awayRarelyBlank = sharedFunctions.awayHasAtMostNoScoreGames({
      awayfixtures: lastFiveAwayAwayFixtures,
      maxNoScoreGames: 1, // at most 1 game with 0 goals in last N away games
    });

    // 3) History: totals usually 2+ in their matches
    const recentFixturesForTotals = [
      ...lastFiveHomeHomeFixtures,
      ...lastFiveAwayAwayFixtures,
    ];

    const recentMostlyOver15 = sharedFunctions.fixtureTotalMinMax({
      fixtures: recentFixturesForTotals,
      minGoals: 2,
      maxGoals: 10,         // we don't care about the upper side for O1.5
      occurencePercentage: 60, // ≥ 60% of recent games have 2+ goals
    });

    const h2hMostlyOver15 = sharedFunctions.fixtureTotalMinMax({
      fixtures: head2HeadMatches,
      minGoals: 2,
      maxGoals: 10,
      occurencePercentage: 60, // tweak if you want stricter
    });

    return (
      atLeastTwoGoalsLikely &&
      homeRarelyBlank &&
      awayRarelyBlank &&
      recentMostlyOver15 &&
      h2hMostlyOver15
    );
  });

  return {
    fixtures: predictedFixtures,
    option: betOptions.find(
      (option) => option.id === betOptionsEnum.OVER_1_5
    ) as betOptionModel,
  };
};
