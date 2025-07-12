import { FixtureDataModel } from "../models/fixtures";
import {
  StandingsDataStandingModel,
  StandingsModel,
} from "../models/standings-models";
import {
  numberOfH2HMatchesBack,
  numberOTeamLastFixturesBack,
} from "../variables/variables";

// Helper function to validate fixtures array
const validateFixtures = (
  fixtures: FixtureDataModel[],
  minRequired = 3
): boolean => {
  return fixtures && fixtures.length >= minRequired;
};

// Improved fixture filtering with better validation and season consideration
export const getLastFiveHomeTeamHomeFixtures = ({
  teamId,
  allFixtures,
  currentSeason,
  minFixtures = numberOTeamLastFixturesBack,
}: {
  teamId: number;
  allFixtures: FixtureDataModel[];
  currentSeason?: number;
  minFixtures?: number;
}) => {
  if (!allFixtures || allFixtures.length === 0) return [];

  return allFixtures
    .filter((fixture) => {
      const isHomeMatch = fixture.teams.home.id === teamId;
      const isFinished = fixture.fixture.status.short === "FT";
      const isCurrentSeason = currentSeason
        ? fixture.league.season === currentSeason
        : true;

      return isHomeMatch && isFinished && isCurrentSeason;
    })
    .sort((a, b) => b.fixture.timestamp - a.fixture.timestamp)
    .slice(0, minFixtures);
};

export const getLastFiveAwayTeamAwayFixtures = ({
  teamId,
  allFixtures,
  currentSeason,
  minFixtures = numberOTeamLastFixturesBack,
}: {
  teamId: number;
  allFixtures: FixtureDataModel[];
  currentSeason?: number;
  minFixtures?: number;
}) => {
  if (!allFixtures || allFixtures.length === 0) return [];

  return allFixtures
    .filter((fixture) => {
      const isAwayMatch = fixture.teams.away.id === teamId;
      const isFinished = fixture.fixture.status.short === "FT";
      const isCurrentSeason = currentSeason
        ? fixture.league.season === currentSeason
        : true;

      return isAwayMatch && isFinished && isCurrentSeason;
    })
    .sort((a, b) => b.fixture.timestamp - a.fixture.timestamp)
    .slice(0, minFixtures);
};

export const getLastFiveTeamFixtures = ({
  teamId,
  allFixtures,
  currentSeason,
  minFixtures = numberOTeamLastFixturesBack,
}: {
  teamId: number;
  allFixtures: FixtureDataModel[];
  currentSeason?: number;
  minFixtures?: number;
}) => {
  if (!allFixtures || allFixtures.length === 0) return [];

  return allFixtures
    .filter((fixture) => {
      const isTeamInvolved =
        fixture.teams.home.id === teamId || fixture.teams.away.id === teamId;
      const isFinished = fixture.fixture.status.short === "FT";
      const isCurrentSeason = currentSeason
        ? fixture.league.season === currentSeason
        : true;

      return isTeamInvolved && isFinished && isCurrentSeason;
    })
    .sort((a, b) => b.fixture.timestamp - a.fixture.timestamp)
    .slice(0, minFixtures);
};

export const getH2HFixtures = ({
  teamOneId,
  teamTwoId,
  allFixtures,
  minFixtures = numberOfH2HMatchesBack,
  includeRecent = true,
}: {
  teamOneId: number;
  teamTwoId: number;
  allFixtures: FixtureDataModel[];
  minFixtures?: number;
  includeRecent?: boolean;
}) => {
  if (!allFixtures || allFixtures.length === 0) return [];

  const filtered = allFixtures
    .filter((fixture) => {
      const teamsInvolved =
        (fixture.teams.home.id === teamOneId ||
          fixture.teams.away.id === teamOneId) &&
        (fixture.teams.home.id === teamTwoId ||
          fixture.teams.away.id === teamTwoId);

      return teamsInvolved && fixture.fixture.status.short === "FT";
    })
    .sort((a, b) => b.fixture.timestamp - a.fixture.timestamp);

  // If we want recent matches but don't have enough, return what we have
  if (includeRecent) {
    return filtered.slice(0, minFixtures);
  }

  // Otherwise ensure we meet the minimum requirement
  return filtered.length >= minFixtures ? filtered.slice(0, minFixtures) : [];
};

// Improved scoring functions with weighted averages and momentum consideration
export const HomeTeamScroreInMostHomeFixtures = ({
  homefixtures,
  minGoals,
  requiredPercentage = 0.7,
  weightRecent = true,
}: {
  homefixtures: FixtureDataModel[];
  minGoals: number;
  requiredPercentage?: number;
  weightRecent?: boolean;
}) => {
  if (!validateFixtures(homefixtures)) return false;

  let totalWeight = 0;
  let weightedCount = 0;

  homefixtures.forEach((fixture, index) => {
    const weight = weightRecent
      ? (homefixtures.length - index) / homefixtures.length
      : 1;
    totalWeight += weight;

    if (fixture.goals.home >= minGoals) {
      weightedCount += weight;
    }
  });

  return weightedCount / totalWeight >= requiredPercentage;
};

export const awayTeamScroreInMostAwayFixtures = ({
  awayfixtures,
  minGoals,
  requiredPercentage = 0.6,
  weightRecent = true,
}: {
  awayfixtures: FixtureDataModel[];
  minGoals: number;
  requiredPercentage?: number;
  weightRecent?: boolean;
}) => {
  if (!validateFixtures(awayfixtures)) return false;

  let totalWeight = 0;
  let weightedCount = 0;

  awayfixtures.forEach((fixture, index) => {
    const weight = weightRecent
      ? (awayfixtures.length - index) / awayfixtures.length
      : 1;
    totalWeight += weight;

    if (fixture.goals.away >= minGoals) {
      weightedCount += weight;
    }
  });

  return weightedCount / totalWeight >= requiredPercentage;
};

// Improved win/loss pattern detection
export const homeTeamFailWinningInMostHomeFixtures = ({
  homefixtures,
  requiredPercentage = 0.6,
  considerDrawsAsFailure = true,
}: {
  homefixtures: FixtureDataModel[];
  requiredPercentage?: number;
  considerDrawsAsFailure?: boolean;
}) => {
  if (!validateFixtures(homefixtures)) return false;

  let conditionPassedCount = 0;

  homefixtures.forEach((fixtureData) => {
    if (considerDrawsAsFailure) {
      if (fixtureData.goals.home <= fixtureData.goals.away) {
        conditionPassedCount += 1;
      }
    } else {
      if (fixtureData.goals.home < fixtureData.goals.away) {
        conditionPassedCount += 1;
      }
    }
  });

  return conditionPassedCount / homefixtures.length >= requiredPercentage;
};

export const awayTeamFailWinningInMostAwayFixtures = ({
  awayFixtures,
  requiredPercentage = 0.6,
  considerDrawsAsFailure = true,
}: {
  awayFixtures: FixtureDataModel[];
  requiredPercentage?: number;
  considerDrawsAsFailure?: boolean;
}) => {
  if (!validateFixtures(awayFixtures)) return false;

  let conditionPassedCount = 0;

  awayFixtures.forEach((fixtureData) => {
    if (considerDrawsAsFailure) {
      if (fixtureData.goals.away <= fixtureData.goals.home) {
        conditionPassedCount += 1;
      }
    } else {
      if (fixtureData.goals.away < fixtureData.goals.home) {
        conditionPassedCount += 1;
      }
    }
  });

  return conditionPassedCount / awayFixtures.length >= requiredPercentage;
};

// Improved goal-based predictions with more nuanced analysis
export const homeTeamMinGoals = ({
  homeTeamFixtures,
  minGoals,
  occurencePercentage,
  weightRecent = true,
}: {
  homeTeamFixtures: FixtureDataModel[];
  minGoals: number;
  occurencePercentage: number;
  weightRecent?: boolean;
}) => {
  if (!validateFixtures(homeTeamFixtures)) return false;

  let totalWeight = 0;
  let weightedCount = 0;

  homeTeamFixtures.forEach((fixture, index) => {
    const weight = weightRecent
      ? (homeTeamFixtures.length - index) / homeTeamFixtures.length
      : 1;
    totalWeight += weight;

    if (fixture.goals.home >= minGoals) {
      weightedCount += weight;
    }
  });

  return (weightedCount / totalWeight) * 100 >= occurencePercentage;
};

export const awayTeamMinGoals = ({
  awayTeamFixtures,
  minGoals,
  occurencePercentage,
  weightRecent = true,
}: {
  awayTeamFixtures: FixtureDataModel[];
  minGoals: number;
  occurencePercentage: number;
  weightRecent?: boolean;
}) => {
  if (!validateFixtures(awayTeamFixtures)) return false;

  let totalWeight = 0;
  let weightedCount = 0;

  awayTeamFixtures.forEach((fixture, index) => {
    const weight = weightRecent
      ? (awayTeamFixtures.length - index) / awayTeamFixtures.length
      : 1;
    totalWeight += weight;

    if (fixture.goals.away >= minGoals) {
      weightedCount += weight;
    }
  });

  return (weightedCount / totalWeight) * 100 >= occurencePercentage;
};

// Improved win percentage analysis
export const homeTeamWinsMostMatches = ({
  fixtures,
  homeTeamId,
  winPercentage = 60,
  considerRecentForm = true,
}: {
  fixtures: FixtureDataModel[];
  homeTeamId: number;
  winPercentage?: number;
  considerRecentForm?: boolean;
}) => {
  if (!validateFixtures(fixtures)) return false;

  let conditionPassedCount = 0;
  let totalWeight = 0;

  fixtures.forEach((fixture, index) => {
    const weight = considerRecentForm
      ? (fixtures.length - index) / fixtures.length
      : 1;
    totalWeight += weight;

    if (
      (fixture.score.fulltime.home > fixture.score.fulltime.away &&
        fixture.teams.home.id === homeTeamId) ||
      (fixture.score.fulltime.away > fixture.score.fulltime.home &&
        fixture.teams.away.id === homeTeamId)
    ) {
      conditionPassedCount += weight;
    }
  });

  return (conditionPassedCount / totalWeight) * 100 >= winPercentage;
};

export const awayTeamWinsMostMatchesTimes = ({
  fixtures,
  awayTeamId,
  winPercentage = 60,
  considerRecentForm = true,
}: {
  fixtures: FixtureDataModel[];
  awayTeamId: number;
  winPercentage?: number;
  considerRecentForm?: boolean;
}) => {
  if (!validateFixtures(fixtures)) return false;

  let conditionPassedCount = 0;
  let totalWeight = 0;

  fixtures.forEach((fixture, index) => {
    const weight = considerRecentForm
      ? (fixtures.length - index) / fixtures.length
      : 1;
    totalWeight += weight;

    if (
      (fixture.score.fulltime.home > fixture.score.fulltime.away &&
        fixture.teams.home.id === awayTeamId) ||
      (fixture.score.fulltime.away > fixture.score.fulltime.home &&
        fixture.teams.away.id === awayTeamId)
    ) {
      conditionPassedCount += weight;
    }
  });

  return (conditionPassedCount / totalWeight) * 100 >= winPercentage;
};
export const filterByDate = (fixtures: FixtureDataModel[]) =>
  fixtures.sort((fixtureA, fixtureB) => {
    return fixtureA.fixture.timestamp - fixtureB.fixture.timestamp;
  });

export const teamDidNotLoseLastFixture = ({
  allPastFiveFixtures,
  teamId,
}: {
  allPastFiveFixtures: FixtureDataModel[];
  teamId: number;
}) => {
  if (
    (allPastFiveFixtures[0].teams.home.id === teamId &&
      allPastFiveFixtures[0].goals.home >= allPastFiveFixtures[0].goals.away) ||
    (allPastFiveFixtures[0].teams.away.id === teamId &&
      allPastFiveFixtures[0].goals.away >= allPastFiveFixtures[0].goals.home)
  ) {
    return true;
  }
  return false;
};

// Improved standings analysis
export const getHomeTeamStanding = ({
  standings,
  homeTeamId,
  leagueId,
}: {
  standings: StandingsModel[];
  homeTeamId: number;
  leagueId: number;
}) => {
  if (!standings || standings.length === 0) return null;

  let teamStanding: StandingsDataStandingModel | null = null;

  standings.forEach((standing) => {
    standing?.response?.forEach((leagueResponse) => {
      if (leagueResponse.league.id === leagueId) {
        leagueResponse.league.standings?.forEach((standingGroup) => {
          const foundStanding = standingGroup.find(
            (s) => s.team.id === homeTeamId
          );
          if (foundStanding) {
            teamStanding = foundStanding;
          }
        });
      }
    });
  });

  return teamStanding;
};

export const getAwayTeamStanding = ({
  standings,
  awayTeamId,
  leagueId,
}: {
  standings: StandingsModel[];
  awayTeamId: number;
  leagueId: number;
}) => {
  if (!standings || standings.length === 0) return null;

  let teamStanding: StandingsDataStandingModel | null = null;

  standings.forEach((standing) => {
    standing?.response?.forEach((leagueResponse) => {
      if (leagueResponse.league.id === leagueId) {
        leagueResponse.league.standings?.forEach((standingGroup) => {
          const foundStanding = standingGroup.find(
            (s) => s.team.id === awayTeamId
          );
          if (foundStanding) {
            teamStanding = foundStanding;
          }
        });
      }
    });
  });

  return teamStanding;
};

export const homeTeamGoalsPercentage = ({
  homeTeamStanding,
}: {
  homeTeamStanding: StandingsDataStandingModel;
}) => {
  const numberOfMatches = homeTeamStanding?.all.played;
  const goalsScored = homeTeamStanding?.all.goals.for;
  return (goalsScored / numberOfMatches) * 100;
};

export const awayTeamGoalsPercentage = ({
  awayTeamStanding,
}: {
  awayTeamStanding: StandingsDataStandingModel;
}) => {
  const numberOfMatches = awayTeamStanding?.all.played;
  const goalsScored = awayTeamStanding?.all.goals.for;
  return (goalsScored / numberOfMatches) * 100;
};

export const againstHomeTeamGoalsPercentage = ({
  homeTeamStanding,
}: {
  homeTeamStanding: StandingsDataStandingModel;
}) => {
  const numberOfMatches = homeTeamStanding?.all.played;
  const goalsScored = homeTeamStanding?.all.goals.against;
  return (goalsScored / numberOfMatches) * 100;
};

export const againstAwayTeamGoalsPercentage = ({
  awayTeamStanding,
}: {
  awayTeamStanding: StandingsDataStandingModel;
}) => {
  const numberOfMatches = awayTeamStanding?.all.played;
  const goalsScored = awayTeamStanding?.all.goals.against;
  return (goalsScored / numberOfMatches) * 100;
};

// Improved H2H analysis
export const awayTeamScroreInMostH2HFixtures = ({
  h2hFixtures,
  minGoals,
  awayTeamId,
  requiredPercentage = 0.8,
  adjustForRecent = true,
}: {
  h2hFixtures: FixtureDataModel[];
  minGoals: number;
  awayTeamId: number;
  requiredPercentage?: number;
  adjustForRecent?: boolean;
}) => {
  if (!validateFixtures(h2hFixtures)) return false;

  let totalWeight = 0;
  let weightedCount = 0;

  h2hFixtures.forEach((fixture, index) => {
    const weight = adjustForRecent
      ? (h2hFixtures.length - index) / h2hFixtures.length
      : 1;
    totalWeight += weight;

    if (
      (fixture.goals.home >= minGoals &&
        fixture.teams.home.id === awayTeamId) ||
      (fixture.goals.away >= minGoals && fixture.teams.away.id === awayTeamId)
    ) {
      weightedCount += weight;
    }
  });

  return weightedCount / totalWeight >= requiredPercentage;
};

export const getAllAwayTeamAwayFixtures = ({
  teamId,
  allFixtures,
  currentSeason,
}: {
  teamId: number;
  allFixtures: FixtureDataModel[];
  currentSeason: number;
}) => {
  return (
    allFixtures
      .filter((fixture) => {
        return (
          fixture.teams.away.id === teamId &&
          fixture.fixture.status.short === "FT"
        );
      })
      // .filter(fixture=> fixture.league.season === currentSeason) //Change this
      .sort((fixtureA, fixtureB) => {
        return fixtureB.fixture.timestamp - fixtureA.fixture.timestamp;
      })
  );
};

export const getAllHomeTeamHomeFixtures = ({
  teamId,
  allFixtures,
  currentSeason,
}: {
  teamId: number;
  allFixtures: FixtureDataModel[];
  currentSeason: number;
}) => {
  return (
    allFixtures
      .filter((fixture) => {
        return (
          fixture.teams.home.id === teamId &&
          fixture.fixture.status.short === "FT"
        );
      })
      // .filter(fixture=> fixture.league.season === currentSeason)
      .sort((fixtureA, fixtureB) => {
        return fixtureB.fixture.timestamp - fixtureA.fixture.timestamp;
      })
  );
};

export const homeTeamScroreInMostH2HFixtures = ({
  h2hFixtures,
  minGoals,
  homeTeamId,
  requiredPercentage = 0.8,
  adjustForRecent = true,
}: {
  h2hFixtures: FixtureDataModel[];
  minGoals: number;
  homeTeamId: number;
  requiredPercentage?: number;
  adjustForRecent?: boolean;
}) => {
  if (!validateFixtures(h2hFixtures)) return false;

  let totalWeight = 0;
  let weightedCount = 0;

  h2hFixtures.forEach((fixture, index) => {
    const weight = adjustForRecent
      ? (h2hFixtures.length - index) / h2hFixtures.length
      : 1;
    totalWeight += weight;

    if (
      (fixture.goals.home >= minGoals &&
        fixture.teams.home.id === homeTeamId) ||
      (fixture.goals.away >= minGoals && fixture.teams.away.id === homeTeamId)
    ) {
      weightedCount += weight;
    }
  });

  return weightedCount / totalWeight >= requiredPercentage;
};

// Improved average goal calculations with outlier removal
export const averageGoalsScoredAtHome = ({
  homeTeamHomeFixtures,
  removeOutliers = true,
}: {
  homeTeamHomeFixtures: FixtureDataModel[];
  removeOutliers?: boolean;
}) => {
  if (!validateFixtures(homeTeamHomeFixtures)) return 0;

  const goals = homeTeamHomeFixtures.map((f) => f.goals.home);

  if (removeOutliers && goals.length > 3) {
    // Remove top and bottom 20% as potential outliers
    goals.sort((a, b) => a - b);
    const removeCount = Math.floor(goals.length * 0.2);
    const filteredGoals = goals.slice(removeCount, goals.length - removeCount);
    return (
      filteredGoals.reduce((sum, goal) => sum + goal, 0) / filteredGoals.length
    );
  }

  return goals.reduce((sum, goal) => sum + goal, 0) / goals.length;
};

export const averageGoalsConcededAtHome = ({
  homeTeamHomeFixtures,
  removeOutliers = true,
}: {
  homeTeamHomeFixtures: FixtureDataModel[];
  removeOutliers?: boolean;
}) => {
  if (!validateFixtures(homeTeamHomeFixtures)) return 0;

  const goals = homeTeamHomeFixtures.map((f) => f.goals.away);

  if (removeOutliers && goals.length > 3) {
    goals.sort((a, b) => a - b);
    const removeCount = Math.floor(goals.length * 0.2);
    const filteredGoals = goals.slice(removeCount, goals.length - removeCount);
    return (
      filteredGoals.reduce((sum, goal) => sum + goal, 0) / filteredGoals.length
    );
  }

  return goals.reduce((sum, goal) => sum + goal, 0) / goals.length;
};

export const averageGoalsScoredAway = ({
  awayTeamAwayFixtures,
  removeOutliers = true,
}: {
  awayTeamAwayFixtures: FixtureDataModel[];
  removeOutliers?: boolean;
}) => {
  if (!validateFixtures(awayTeamAwayFixtures)) return 0;

  const goals = awayTeamAwayFixtures.map((f) => f.goals.away);

  if (removeOutliers && goals.length > 3) {
    goals.sort((a, b) => a - b);
    const removeCount = Math.floor(goals.length * 0.2);
    const filteredGoals = goals.slice(removeCount, goals.length - removeCount);
    return (
      filteredGoals.reduce((sum, goal) => sum + goal, 0) / filteredGoals.length
    );
  }

  return goals.reduce((sum, goal) => sum + goal, 0) / goals.length;
};

export const averageGoalsConcededAway = ({
  awayTeamAwayFixtures,
  removeOutliers = true,
}: {
  awayTeamAwayFixtures: FixtureDataModel[];
  removeOutliers?: boolean;
}) => {
  if (!validateFixtures(awayTeamAwayFixtures)) return 0;

  const goals = awayTeamAwayFixtures.map((f) => f.goals.home);

  if (removeOutliers && goals.length > 3) {
    goals.sort((a, b) => a - b);
    const removeCount = Math.floor(goals.length * 0.2);
    const filteredGoals = goals.slice(removeCount, goals.length - removeCount);
    return (
      filteredGoals.reduce((sum, goal) => sum + goal, 0) / filteredGoals.length
    );
  }

  return goals.reduce((sum, goal) => sum + goal, 0) / goals.length;
};

// Improved goal expectation functions
export const teamMin0 = ({
  teamAAverageGoalsScored,
  teamBAverageGoalsConceded,
  variance = 0.2,
}: {
  teamAAverageGoalsScored: number;
  teamBAverageGoalsConceded: number;
  variance?: number;
}) => {
  return (
    teamAAverageGoalsScored < 0.9 + variance &&
    teamBAverageGoalsConceded < 0.8 + variance
  );
};

export const teamMax0 = ({
  teamAAverageGoalsScored,
  teamBAverageGoalsConceded,
  variance = 0.2,
}: {
  teamAAverageGoalsScored: number;
  teamBAverageGoalsConceded: number;
  variance?: number;
}) => {
  return (
    teamAAverageGoalsScored <= 0.8 + variance &&
    teamBAverageGoalsConceded <= 0.8 + variance
  );
};

export const teamMax1 = ({
  teamAAverageGoalsScored,
  teamBAverageGoalsConceded,
}: {
  teamAAverageGoalsScored: number;
  teamBAverageGoalsConceded: number;
}) => {
  const combinedAverage =
    (teamAAverageGoalsScored + teamBAverageGoalsConceded) / 2;
  return (
    (teamAAverageGoalsScored <= 0.9 && teamBAverageGoalsConceded < 1) ||
    (teamAAverageGoalsScored <= 0.8 && teamBAverageGoalsConceded < 1.5) ||
    combinedAverage < 0.9
  );
};

export const teamMin1 = ({
  teamAAverageGoalsScored,
  teamBAverageGoalsConceded,
  minThreshold = 1.2,
}: {
  teamAAverageGoalsScored: number;
  teamBAverageGoalsConceded: number;
  minThreshold?: number;
}) => {
  return (
    teamAAverageGoalsScored >= minThreshold && teamBAverageGoalsConceded >= 1
  );
};

export const teamMax2 = ({
  teamAAverageGoalsScored,
  teamBAverageGoalsConceded,
}: {
  teamAAverageGoalsScored: number;
  teamBAverageGoalsConceded: number;
}) => {
  const combinedAverage =
    (teamAAverageGoalsScored + teamBAverageGoalsConceded) / 2;
  return combinedAverage + 0.8 <= 2; // More conservative estimate
};

export const teamMin2 = ({
  teamAAverageGoalsScored,
  teamBAverageGoalsConceded,
  minThreshold = 1.8,
}: {
  teamAAverageGoalsScored: number;
  teamBAverageGoalsConceded: number;
  minThreshold?: number;
}) => {
  return (
    (teamAAverageGoalsScored >= minThreshold &&
      teamBAverageGoalsConceded >= 1.8) ||
    (teamAAverageGoalsScored >= 2 && teamBAverageGoalsConceded >= 1.5)
  );
};

type GoalStats = {
  teamAAverageGoalsScored: number;
  teamBAverageGoalsConceded: number;
};

const adjustedGoalEstimate = ({
  teamAAverageGoalsScored,
  teamBAverageGoalsConceded,
}: GoalStats) => {
  return (teamAAverageGoalsScored + teamBAverageGoalsConceded) / 2 + 1;
};

// Predict whether estimated total goals stay under or equal to maxGoalLimit
export const isMaxGoalsLikely = (stats: GoalStats, maxGoalLimit: number) => {
  return adjustedGoalEstimate(stats) <= maxGoalLimit;
};

export const teamMax3 = (stats: GoalStats) => isMaxGoalsLikely(stats, 3);
export const teamMax4 = (stats: GoalStats) => isMaxGoalsLikely(stats, 4);

// Flexible goal condition matcher
const meetsMinThreshold = (
  { teamAAverageGoalsScored, teamBAverageGoalsConceded }: GoalStats,
  thresholds: [number, number][]
): boolean => {
  return thresholds.some(
    ([minA, minB]) =>
      teamAAverageGoalsScored >= minA && teamBAverageGoalsConceded >= minB
  );
};

export const teamMin3 = (stats: GoalStats) =>
  meetsMinThreshold(stats, [
    [3, 3],
    [2, 2.5],
    [1.8, 3],
    [3.2, 2],
  ]);

export const teamMin4 = (stats: GoalStats) =>
  meetsMinThreshold(stats, [[4, 4]]);

export default {
  getLastFiveHomeTeamHomeFixtures,
  getLastFiveAwayTeamAwayFixtures,
  getH2HFixtures,
  HomeTeamScroreInMostHomeFixtures,
  awayTeamScroreInMostAwayFixtures,
  homeTeamFailWinningInMostHomeFixtures,
  awayTeamFailWinningInMostAwayFixtures,
  homeTeamMinGoals,
  awayTeamMinGoals,
  homeTeamWinsMostMatches,
  awayTeamWinsMostMatchesTimes,
  filterByDate,
  getHomeTeamStanding,
  getAwayTeamStanding,
  homeTeamGoalsPercentage,
  againstHomeTeamGoalsPercentage,
  againstAwayTeamGoalsPercentage,
  awayTeamScroreInMostH2HFixtures,
  homeTeamScroreInMostH2HFixtures,
  awayTeamGoalsPercentage,
  teamDidNotLoseLastFixture,
  getAllHomeTeamHomeFixtures,
  getAllAwayTeamAwayFixtures,
  averageGoalsScoredAtHome,
  averageGoalsConcededAtHome,
  averageGoalsScoredAway,
  averageGoalsConcededAway,
  teamMax0,
  teamMin0,
  teamMax1,
  teamMin1,
  teamMax2,
  teamMin2,
  teamMax3,
  teamMin3,
  teamMax4,
  teamMin4,
};
