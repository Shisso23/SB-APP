import { FixtureDataModel } from "../models/fixtures";
import { StandingsDataStandingModel, StandingsModel } from "../models/standings-models";
import { numberOfH2HMatchesBack, numberOTeamLastFixturesBack } from "../variables/variables";

const MIN_FORM_FIXTURES = 3;
const MIN_H2H_FIXTURES = 2;
const MAX_REASONABLE_GOALS = 5;

const hasMinimumSample = (fixtures: FixtureDataModel[], minimumSample = 1) =>
  Array.isArray(fixtures) && fixtures.length >= minimumSample;

const ratioAtLeast = ({
  passed,
  total,
  ratio,
  minimumSample = 1,
}: {
  passed: number;
  total: number;
  ratio: number;
  minimumSample?: number;
}) => {
  if (total < minimumSample || total === 0) {
    return false;
  }
  return passed / total >= ratio;
};

const percentageAtLeast = ({
  passed,
  total,
  percentage,
  minimumSample = 1,
}: {
  passed: number;
  total: number;
  percentage: number;
  minimumSample?: number;
}) => ratioAtLeast({ passed, total, ratio: percentage / 100, minimumSample });

const countMatchingFixtures = (
  fixtures: FixtureDataModel[],
  predicate: (fixture: FixtureDataModel) => boolean
) => fixtures.reduce((count, fixture) => (predicate(fixture) ? count + 1 : count), 0);

const sortedFinishedFixtures = (
  allFixtures: FixtureDataModel[],
  predicate: (fixture: FixtureDataModel) => boolean
) =>
  allFixtures
    .filter(
      (fixture) =>
        predicate(fixture) &&
        fixture.fixture?.status?.short === "FT"
    )
    .sort((fixtureA, fixtureB) => fixtureB.fixture.timestamp - fixtureA.fixture.timestamp);

const clampNumber = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const recencyWeightedAverage = (values: number[]) => {
  if (values.length === 0) {
    return 0;
  }

  const weighted = values.reduce(
    (acc, value, index) => {
      const weight = values.length - index;
      return {
        weightedSum: acc.weightedSum + value * weight,
        weightTotal: acc.weightTotal + weight,
      };
    },
    { weightedSum: 0, weightTotal: 0 }
  );

  if (weighted.weightTotal === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const median =
    sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];

  const weightedAverage = weighted.weightedSum / weighted.weightTotal;

  return clampNumber((weightedAverage * 0.8) + (median * 0.2), 0, MAX_REASONABLE_GOALS);
};

const averageFromFixtures = (
  fixtures: FixtureDataModel[],
  goalSelector: (fixture: FixtureDataModel) => number
) => {
  if (!fixtures.length) {
    return 0;
  }

  const recentFixtures = fixtures.slice(0, numberOTeamLastFixturesBack);
  const goals = recentFixtures.map((fixture) => {
    const parsedGoal = Number(goalSelector(fixture));
    return Number.isFinite(parsedGoal) ? parsedGoal : 0;
  });

  return recencyWeightedAverage(goals);
};


export const getLastFiveHomeTeamHomeFixtures = ({
    teamId,
    allFixtures,
  }: {
    teamId: number;
    allFixtures: FixtureDataModel[];
  }) => {
    return sortedFinishedFixtures(
      allFixtures,
      (fixture) => fixture.teams.home.id === teamId
    ).slice(0, numberOTeamLastFixturesBack);
  };
  
  export const getLastFiveAwayTeamAwayFixtures = ({
    teamId,
    allFixtures,
  }: {
    teamId: number;
    allFixtures: FixtureDataModel[];
  }) => {
    return sortedFinishedFixtures(
      allFixtures,
      (fixture) => fixture.teams.away.id === teamId
    ).slice(0, numberOTeamLastFixturesBack);
  };

  export const getLastFiveTeamFixtures = ({
    teamId,
    allFixtures,
  }: {
    teamId: number;
    allFixtures: FixtureDataModel[];
  }) => {
    return sortedFinishedFixtures(
      allFixtures,
      (fixture) => fixture.teams.away.id === teamId || fixture.teams.home.id === teamId
    ).slice(0, numberOTeamLastFixturesBack);
  };
  
  export const getH2HFixtures = ({
    teamOneId,
    teamTwoId,
    allFixtures,
  }: {
    teamOneId: number;
    teamTwoId: number;
    allFixtures: FixtureDataModel[];
  }) => {
    return sortedFinishedFixtures(
      allFixtures,
      (fixture) =>
        (fixture.teams.home.id === teamOneId || fixture.teams.away.id === teamOneId) &&
        (fixture.teams.home.id === teamTwoId || fixture.teams.away.id === teamTwoId)
    ).slice(0, numberOfH2HMatchesBack);
  };
  
  export const HomeTeamScroreInMostHomeFixtures = ({
    homefixtures,
    minGoals,
  }: {
    homefixtures: FixtureDataModel[];
    minGoals: number;
  }) => {
    const conditionPassedCount = countMatchingFixtures(
      homefixtures,
      (fixtureData) => fixtureData.goals.home >= minGoals
    );

    return ratioAtLeast({
      passed: conditionPassedCount,
      total: homefixtures.length,
      ratio: 0.8,
      minimumSample: MIN_FORM_FIXTURES,
    });
  };

  export const awayTeamScroreInMostAwayFixtures = ({
    awayfixtures,
    minGoals,
  }: {
    awayfixtures: FixtureDataModel[];
    minGoals: number;
  }) => {
    const conditionPassedCount = countMatchingFixtures(
      awayfixtures,
      (fixtureData) => fixtureData.goals.away >= minGoals
    );

    return ratioAtLeast({
      passed: conditionPassedCount,
      total: awayfixtures.length,
      ratio: 0.6,
      minimumSample: MIN_FORM_FIXTURES,
    });
  };
  
  export const awayTeamFailScroringInMostAwayFixtures = ({
    awayfixtures,
  }: {
    awayfixtures: FixtureDataModel[];
  }) => {
    const conditionPassedCount = countMatchingFixtures(
      awayfixtures,
      (fixtureData) => fixtureData.goals.away < 1
    );

    return ratioAtLeast({
      passed: conditionPassedCount,
      total: awayfixtures.length,
      ratio: 0.45,
      minimumSample: MIN_FORM_FIXTURES,
    });
  };

  export const teamDidNotWinLastFixture=({allPastFiveFixtures, teamId}: {allPastFiveFixtures: FixtureDataModel[], teamId: number })=>{
      const lastFixture = allPastFiveFixtures?.[0];
      if (!lastFixture) {
        return false;
      }

      if ((lastFixture.teams.home.id=== teamId && lastFixture.goals.home<= lastFixture.goals.away)||
      lastFixture.teams.away.id=== teamId && lastFixture.goals.away<= lastFixture.goals.home
      ){
        return true
      }
      return false
  }

  export const teamDidNotLoseLastFixture=({allPastFiveFixtures, teamId}: {allPastFiveFixtures: FixtureDataModel[], teamId: number })=>{
    const lastFixture = allPastFiveFixtures?.[0];
    if (!lastFixture) {
      return false;
    }

    if ((lastFixture.teams.home.id=== teamId && lastFixture.goals.home>= lastFixture.goals.away)||
    lastFixture.teams.away.id=== teamId && lastFixture.goals.away>= lastFixture.goals.home
    ){
      return true
    }
    return false
}

  export const teamWonLastFixture=({allPastFiveFixtures, teamId}: {allPastFiveFixtures: FixtureDataModel[], teamId: number })=>{
    const lastFixture = allPastFiveFixtures?.[0];
    if (!lastFixture) {
      return false;
    }

    if ((lastFixture.teams.home.id=== teamId && lastFixture.goals.home> lastFixture.goals.away)||
    lastFixture.teams.away.id=== teamId && lastFixture.goals.away> lastFixture.goals.home
    ){
      return true
    }
    return false
}
  
  export const homeTeamFailScroringInMostHomeFixtures = ({
    homefixtures,
  }: {
    homefixtures: FixtureDataModel[];
  }) => {
    const conditionPassedCount = countMatchingFixtures(
      homefixtures,
      (fixtureData) => fixtureData.goals.home < 1
    );

    return ratioAtLeast({
      passed: conditionPassedCount,
      total: homefixtures.length,
      ratio: 0.45,
      minimumSample: MIN_FORM_FIXTURES,
    });
  };

  export const homeTeamFailWinningInMostHomeFixtures = ({
    homefixtures,
  }: {
    homefixtures: FixtureDataModel[];
  }) => {
    const conditionPassedCount = countMatchingFixtures(
      homefixtures,
      (fixtureData) => fixtureData.goals.home <= fixtureData.goals.away
    );

    return ratioAtLeast({
      passed: conditionPassedCount,
      total: homefixtures.length,
      ratio: 0.6,
      minimumSample: MIN_FORM_FIXTURES,
    });
  };
  
  export const awayTeamFailWinningInMostAwayFixtures = ({
    awayFixtures,
  }: {
    awayFixtures: FixtureDataModel[];
  }) => {
    const conditionPassedCount = countMatchingFixtures(
      awayFixtures,
      (fixtureData) => fixtureData.goals.away <= fixtureData.goals.home
    );

    return ratioAtLeast({
      passed: conditionPassedCount,
      total: awayFixtures.length,
      ratio: 0.6,
      minimumSample: MIN_FORM_FIXTURES,
    });
  };
  
  export const homeTeamMinGoals = ({
    homeTeamFixtures,
    minGoals,
    occurencePercentage
  }: {
    homeTeamFixtures: FixtureDataModel[];
    minGoals: number;
    occurencePercentage: number
  }) => {
    const count = countMatchingFixtures(
      homeTeamFixtures,
      (fixture) => fixture.goals.home >= minGoals
    );

    return percentageAtLeast({
      passed: count,
      total: homeTeamFixtures.length,
      percentage: occurencePercentage,
      minimumSample: MIN_FORM_FIXTURES,
    });
  };
  
  export const awayTeamMinGoals = ({
    awayTeamFixtures,
    minGoals,
    occurencePercentage
  }: {
    awayTeamFixtures: FixtureDataModel[];
    minGoals: number;
    occurencePercentage: number
  }) => {
    const count = countMatchingFixtures(
      awayTeamFixtures,
      (fixture) => fixture.goals.away >= minGoals
    );

    return percentageAtLeast({
      passed: count,
      total: awayTeamFixtures.length,
      percentage: occurencePercentage,
      minimumSample: MIN_FORM_FIXTURES,
    });
  };

  export const otherHomeTeamGoalsInAwayFixtures = ({
    awayTeamFixtures,
    goals,
  }: {
    awayTeamFixtures: FixtureDataModel[];
    goals: number;
  }) => {
    const conditionPassedCount = countMatchingFixtures(
      awayTeamFixtures,
      (fixtureData) => fixtureData.goals.home >= goals
    );

    return ratioAtLeast({
      passed: conditionPassedCount,
      total: awayTeamFixtures.length,
      ratio: 0.8,
      minimumSample: MIN_FORM_FIXTURES,
    });
  };
  
  export const otherAwayTeamGoalsInHomeFixtures = ({
    homeTeamFixtures,
    goals,
  }: {
    homeTeamFixtures: FixtureDataModel[];
    goals: number;
  }) => {
    const conditionPassedCount = countMatchingFixtures(
      homeTeamFixtures,
      (fixtureData) => fixtureData.goals.away >= goals
    );

    return ratioAtLeast({
      passed: conditionPassedCount,
      total: homeTeamFixtures.length,
      ratio: 0.8,
      minimumSample: MIN_FORM_FIXTURES,
    });
  };
  
  export const otherHomeTeamMinMaxGoalsInAwayFixtures = ({
    awayTeamFixtures,
    minGoals,
    maxGoals,
  }: {
    awayTeamFixtures: FixtureDataModel[];
    minGoals: number;
    maxGoals: number;
  }) => {
    const conditionPassedCount = countMatchingFixtures(
      awayTeamFixtures,
      (fixtureData) => fixtureData.goals.home >= minGoals && fixtureData.goals.home <= maxGoals
    );

    return ratioAtLeast({
      passed: conditionPassedCount,
      total: awayTeamFixtures.length,
      ratio: 0.6,
      minimumSample: MIN_FORM_FIXTURES,
    });
  };
  
  export const otherAwayTeamMinMaxGoalsInHomeFixtures = ({
    homeTeamFixtures,
    minGoals,
    maxGoals,
  }: {
    homeTeamFixtures: FixtureDataModel[];
    minGoals: number;
    maxGoals: number;
  }) => {
    const conditionPassedCount = countMatchingFixtures(
      homeTeamFixtures,
      (fixtureData) => fixtureData.goals.away >= minGoals && fixtureData.goals.away <= maxGoals
    );

    return ratioAtLeast({
      passed: conditionPassedCount,
      total: homeTeamFixtures.length,
      ratio: 0.6,
      minimumSample: MIN_FORM_FIXTURES,
    });
  };
  
  export const homeTeamWinsMostMatches = ({
    fixtures,
    homeTeamId,
    winPercentage = 60
  }: {
    fixtures: FixtureDataModel[];
    homeTeamId: number;
    winPercentage?: number
  }) => {
    const conditionPassedCount = countMatchingFixtures(
      fixtures,
      (fixtureData) =>
        (fixtureData.score.fulltime.home > fixtureData.score.fulltime.away &&
          fixtureData.teams.home.id === homeTeamId) ||
        (fixtureData.score.fulltime.away > fixtureData.score.fulltime.home &&
          fixtureData.teams.away.id === homeTeamId)
    );

    return percentageAtLeast({
      passed: conditionPassedCount,
      total: fixtures.length,
      percentage: winPercentage,
      minimumSample: MIN_H2H_FIXTURES,
    });
  };
  //  return false;
  //   }
  // };
  
  export const awayTeamWinsMostMatchesTimes = ({
    fixtures,
    awayTeamId,
    winPercentage = 60
  }: {
    fixtures: FixtureDataModel[];
    awayTeamId: number;
    winPercentage?: number
  }) => {
    const conditionPassedCount = countMatchingFixtures(
      fixtures,
      (fixtureData) =>
        (fixtureData.score.fulltime.home > fixtureData.score.fulltime.away &&
          fixtureData.teams.home.id === awayTeamId) ||
        (fixtureData.score.fulltime.away > fixtureData.score.fulltime.home &&
          fixtureData.teams.away.id === awayTeamId)
    );

    return percentageAtLeast({
      passed: conditionPassedCount,
      total: fixtures.length,
      percentage: winPercentage,
      minimumSample: MIN_H2H_FIXTURES,
    });
  };
  
  export const filterByDate = (fixtures: FixtureDataModel[]) =>
    [...fixtures].sort((fixtureA, fixtureB) => {
      return fixtureA.fixture.timestamp - fixtureB.fixture.timestamp;
    });
  
  export const getHomeTeamStanding = ({
    standings,
    homeTeamId,
    leagueId,
  }: {
    standings: StandingsModel[];
    homeTeamId: number;
    leagueId: number;
  }) => {
    let teamStanding: StandingsDataStandingModel;
    standings.forEach((standing) => {
      const response = standing?.response?.[0];
      if (!response || response.league?.id !== leagueId) {
        return;
      }

      response.league.standings.forEach((teamStanding_) => {
        teamStanding_.forEach((standing_) => {
          if (`${standing_.team.id}` === `${homeTeamId}`) {
            teamStanding = standing_;
          }
        });
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
    let teamStanding: StandingsDataStandingModel;
    standings.forEach((standing) => {
      const response = standing?.response?.[0];
      if (!response || response.league?.id !== leagueId) {
        return;
      }

      response.league.standings.forEach((teamStanding_) => {
        teamStanding_.forEach((standing_) => {
          if (`${standing_.team.id}` === `${awayTeamId}`) {
            teamStanding = standing_;
          }
        });
      });
    });
    return teamStanding;
  };
  
  export const homeTeamGoalsPercentage = ({
    homeTeamStanding,
  }: {
    homeTeamStanding: StandingsDataStandingModel;
  }) => {
    const numberOfMatches = homeTeamStanding?.all.played || 0;
    const goalsScored = homeTeamStanding?.all.goals.for || 0;
    if (numberOfMatches === 0) {
      return 0;
    }
    return (goalsScored / numberOfMatches) * 100;
  };
  
  export const awayTeamGoalsPercentage = ({
    awayTeamStanding,
  }: {
    awayTeamStanding: StandingsDataStandingModel;
  }) => {
    const numberOfMatches = awayTeamStanding?.all.played || 0;
    const goalsScored = awayTeamStanding?.all.goals.for || 0;
    if (numberOfMatches === 0) {
      return 0;
    }
    return (goalsScored / numberOfMatches) * 100;
  };
  
  export const againstHomeTeamGoalsPercentage = ({
    homeTeamStanding,
  }: {
    homeTeamStanding: StandingsDataStandingModel;
  }) => {
    const numberOfMatches = homeTeamStanding?.all.played || 0;
    const goalsScored = homeTeamStanding?.all.goals.against || 0;
    if (numberOfMatches === 0) {
      return 0;
    }
    return (goalsScored / numberOfMatches) * 100;
  };
  
  export const againstAwayTeamGoalsPercentage = ({
    awayTeamStanding,
  }: {
    awayTeamStanding: StandingsDataStandingModel;
  }) => {
    const numberOfMatches = awayTeamStanding?.all.played || 0;
    const goalsScored = awayTeamStanding?.all.goals.against || 0;
    if (numberOfMatches === 0) {
      return 0;
    }
    return (goalsScored / numberOfMatches) * 100;
  };


  export const hasNoNilNilInFixtures  =({fixtures}:{fixtures: FixtureDataModel[]})=>{
    if (!fixtures.length) {
      return false;
    }

    if (fixtures.every(fixture=> fixture.goals.home+ fixture.goals.away>=1)){
      return true
    }
    return false
  }
  
  export const awayTeamScroreInMostH2HFixtures =({h2hFixtures, minGoals, awayTeamId}: {h2hFixtures: FixtureDataModel[]; minGoals: number, awayTeamId: number })=>{
    const conditionPassedCount = countMatchingFixtures(
      h2hFixtures,
      (fixtureData) =>
        ((fixtureData.goals.home>= minGoals) && fixtureData.teams.home.id ===awayTeamId) ||
        ((fixtureData.goals.away>= minGoals) && fixtureData.teams.away.id ===awayTeamId)
    );

    return ratioAtLeast({
      passed: conditionPassedCount,
      total: h2hFixtures.length,
      ratio: 0.8,
      minimumSample: MIN_H2H_FIXTURES,
    });
  }
  
  export const homeTeamScroreInMostH2HFixtures =({h2hFixtures, minGoals, homeTeamId}: {h2hFixtures: FixtureDataModel[]; minGoals: number, homeTeamId: number })=>{
    const conditionPassedCount = countMatchingFixtures(
      h2hFixtures,
      (fixtureData) =>
        ((fixtureData.goals.home>= minGoals) && fixtureData.teams.home.id ===homeTeamId) ||
        ((fixtureData.goals.away>= minGoals) && fixtureData.teams.away.id ===homeTeamId)
    );

    return ratioAtLeast({
      passed: conditionPassedCount,
      total: h2hFixtures.length,
      ratio: 0.8,
      minimumSample: MIN_H2H_FIXTURES,
    });
  }

  export const teamMinGoalsInH2H =({h2hFixtures, minGoals, teamId, occurencePercentage}: {h2hFixtures: FixtureDataModel[]; minGoals:number; teamId: number; occurencePercentage: number })=>{
    const conditionPassedCount = countMatchingFixtures(
      h2hFixtures,
      (fixtureData) =>
        ((fixtureData.goals.home>= minGoals) && fixtureData.teams.home.id ===teamId) ||
        ((fixtureData.goals.away>= minGoals) && fixtureData.teams.away.id ===teamId)
    );

    return percentageAtLeast({
      passed: conditionPassedCount,
      total: h2hFixtures.length,
      percentage: occurencePercentage,
      minimumSample: MIN_H2H_FIXTURES,
    });
  }

  export const teamMinMaxInH2H =({h2hFixtures, maxGoals, teamId, occurencePercentage}: {h2hFixtures: FixtureDataModel[]; maxGoals:number; teamId: number; occurencePercentage: number })=>{
    const conditionPassedCount = countMatchingFixtures(
      h2hFixtures,
      (fixtureData) =>
        ((fixtureData.goals.home<= maxGoals) && fixtureData.teams.home.id ===teamId) ||
        ((fixtureData.goals.away<= maxGoals) && fixtureData.teams.away.id ===teamId)
    );

    return percentageAtLeast({
      passed: conditionPassedCount,
      total: h2hFixtures.length,
      percentage: occurencePercentage,
      minimumSample: MIN_H2H_FIXTURES,
    });

}
  export const againstAwayTeamMinMax =({awayTeamFixtures, maxGoals, occurencePercentage}: {awayTeamFixtures: FixtureDataModel[]; maxGoals:number; occurencePercentage: number })=>{
    const conditionPassedCount = countMatchingFixtures(
      awayTeamFixtures,
      (fixtureData) => fixtureData.goals.home<= maxGoals
    );

    return percentageAtLeast({
      passed: conditionPassedCount,
      total: awayTeamFixtures.length,
      percentage: occurencePercentage,
      minimumSample: MIN_FORM_FIXTURES,
    });
  }

  export const againstHomeTeamMinMax =({homeTeamFixtures, maxGoals, occurencePercentage}: {homeTeamFixtures: FixtureDataModel[]; maxGoals:number,occurencePercentage: number })=>{
    const conditionPassedCount = countMatchingFixtures(
      homeTeamFixtures,
      (fixtureData) => fixtureData.goals.away<= maxGoals
    );

    return percentageAtLeast({
      passed: conditionPassedCount,
      total: homeTeamFixtures.length,
      percentage: occurencePercentage,
      minimumSample: MIN_FORM_FIXTURES,
    });
  }

  export const fixtureTotalMinMax =({fixtures, maxGoals, minGoals, occurencePercentage}: {fixtures: FixtureDataModel[]; maxGoals:number; minGoals:number; occurencePercentage: number })=>{
    const conditionPassedCount = countMatchingFixtures(
      fixtures,
      (fixtureData) =>
        fixtureData.goals.away + fixtureData.goals.home >= minGoals &&
        fixtureData.goals.away + fixtureData.goals.home <= maxGoals
    );

    return percentageAtLeast({
      passed: conditionPassedCount,
      total: fixtures.length,
      percentage: occurencePercentage,
      minimumSample: MIN_FORM_FIXTURES,
    });
  }

  export const mostFixturesAreBTTS =({fixtures, bttsPercentage=80}: {fixtures: FixtureDataModel[], bttsPercentage: number})=>{
    const conditionPassedCount = countMatchingFixtures(
      fixtures,
      (fixtureData) => fixtureData.goals.home > 0 && fixtureData.goals.away > 0
    );

    return percentageAtLeast({
      passed: conditionPassedCount,
      total: fixtures.length,
      percentage: bttsPercentage,
      minimumSample: MIN_FORM_FIXTURES,
    });

  }
  


  export const goodAwayTeamwinPercentage =({awayStanding, homeStanding, winPercentage, lossPercentage}: {homeStanding: StandingsDataStandingModel, awayStanding: StandingsDataStandingModel, winPercentage: number, lossPercentage: number})=>{
    const awayPlayed = awayStanding?.all?.played || 0;
    const homePlayed = homeStanding?.all?.played || 0;

    if (awayPlayed < MIN_FORM_FIXTURES || homePlayed < MIN_FORM_FIXTURES) {
      return false;
    }

   if ((awayStanding.all.win / awayPlayed) * 100 >= winPercentage && (homeStanding.all.lose / homePlayed * 100) >= lossPercentage){
    return true
   }
   return false
  }

  export const goodHomeTeamwinPercentage =({awayStanding, homeStanding, winPercentage, lossPercentage}: {homeStanding: StandingsDataStandingModel, awayStanding: StandingsDataStandingModel, winPercentage: number, lossPercentage: number})=>{
    const homePlayed = homeStanding?.all?.played || 0;
    const awayPlayed = awayStanding?.all?.played || 0;

    if (awayPlayed < MIN_FORM_FIXTURES || homePlayed < MIN_FORM_FIXTURES) {
      return false;
    }

    if ((homeStanding.all.win / homePlayed) * 100 >= winPercentage && (awayStanding.all.lose / awayPlayed * 100) >= lossPercentage){
     return true
    }
    return false
   }

   export const getAllHomeTeamHomeFixtures = ({
    teamId,
    allFixtures,
    currentSeason
  }: {
    teamId: number;
    allFixtures: FixtureDataModel[];
    currentSeason: number
  }) => {
    const teamFixtures = sortedFinishedFixtures(
      allFixtures,
      (fixture) => fixture.teams.home.id === teamId
    );

    const currentSeasonFixtures = teamFixtures.filter(
      (fixture) => fixture.league.season === currentSeason
    );

    const sourceFixtures = hasMinimumSample(currentSeasonFixtures, MIN_FORM_FIXTURES)
      ? currentSeasonFixtures
      : teamFixtures;

    return sourceFixtures.slice(0, numberOTeamLastFixturesBack);
  };

  export const getAllAwayTeamAwayFixtures = ({
    teamId,
    allFixtures,
    currentSeason
  }: {
    teamId: number;
    allFixtures: FixtureDataModel[];
    currentSeason: number
  }) => {
    const teamFixtures = sortedFinishedFixtures(
      allFixtures,
      (fixture) => fixture.teams.away.id === teamId
    );

    const currentSeasonFixtures = teamFixtures.filter(
      (fixture) => fixture.league.season === currentSeason
    );

    const sourceFixtures = hasMinimumSample(currentSeasonFixtures, MIN_FORM_FIXTURES)
      ? currentSeasonFixtures
      : teamFixtures;

    return sourceFixtures.slice(0, numberOTeamLastFixturesBack);
  };


  export const averageGoalsScoredAtHome = ({
    homeTeamHomeFixtures,
  }: {
    homeTeamHomeFixtures:  FixtureDataModel[];
  })=>{
    return averageFromFixtures(
      homeTeamHomeFixtures,
      (fixture) => fixture.goals.home
    );
  }

  export const averageGoalsConcededAtHome =({
    homeTeamHomeFixtures,
  }: {
    homeTeamHomeFixtures:  FixtureDataModel[];
  })=>{
    return averageFromFixtures(
      homeTeamHomeFixtures,
      (fixture) => fixture.goals.away
    );
  }
 
  export const averageGoalsScoredAway =({
    awayTeamAwayFixtures,
  }: {
    awayTeamAwayFixtures:  FixtureDataModel[];
  })=>{
    return averageFromFixtures(
      awayTeamAwayFixtures,
      (fixture) => fixture.goals.away
    );
  }

  export const averageGoalsConcededAway =({
    awayTeamAwayFixtures,
  }: {
    awayTeamAwayFixtures:  FixtureDataModel[];
  })=>{
    return averageFromFixtures(
      awayTeamAwayFixtures,
      (fixture) => fixture.goals.home
    );
  }

  export const homeHasAtMostNoScoreGames = ({
    homefixtures,
    maxNoScoreGames = 1,
  }: {
    homefixtures: FixtureDataModel[];
    maxNoScoreGames?: number;
  }) => {
    if (!hasMinimumSample(homefixtures, MIN_FORM_FIXTURES)) return false;
  
    const noScoreCount = countMatchingFixtures(
      homefixtures,
      (fixture) => fixture.goals.home === 0
    );
  
    return noScoreCount <= maxNoScoreGames;
  };
  
  export const awayHasAtMostNoScoreGames = ({
    awayfixtures,
    maxNoScoreGames = 1,
  }: {
    awayfixtures: FixtureDataModel[];
    maxNoScoreGames?: number;
  }) => {
    if (!hasMinimumSample(awayfixtures, MIN_FORM_FIXTURES)) return false;
  
    const noScoreCount = countMatchingFixtures(
      awayfixtures,
      (fixture) => fixture.goals.away === 0
    );
  
    return noScoreCount <= maxNoScoreGames;
  };

  type GoalInputs = {
    teamAAverageGoalsScored: number;
    teamBAverageGoalsConceded: number;
  }

  /**
 * Simple blended expected goals for Team A vs Team B.
 * Attack is weighted slightly more than opponent concessions.
 */
const expectedGoalsForTeamA = ({
  teamAAverageGoalsScored,
  teamBAverageGoalsConceded,
}: GoalInputs) => {
  const scored = clampNumber(teamAAverageGoalsScored, 0, MAX_REASONABLE_GOALS);
  const conceded = clampNumber(teamBAverageGoalsConceded, 0, MAX_REASONABLE_GOALS);

  // Blend arithmetic and geometric means so one extreme input does not over-drive xG.
  const linearBlend = (0.68 * scored) + (0.37 * conceded);
  const geometricBlend = Math.sqrt(scored * conceded);
  const volatilityPenalty = Math.abs(scored - conceded) * 0.05;

  const blendedXg = (0.9 * linearBlend) + (0.1 * geometricBlend) - volatilityPenalty;

  return clampNumber(blendedXg, 0, MAX_REASONABLE_GOALS);
};


export const teamMax0 = (inputs: GoalInputs) => {
  const xG = expectedGoalsForTeamA(inputs);
  // Very low attacking expectation: likely to stay on 0
  return xG <= 0.2;
};

export const teamMin0 = (inputs: GoalInputs) => {
  const xG = expectedGoalsForTeamA(inputs);
  // We expect *some* goal threat (not a total blank)
  return xG >= 0.4;
};

export const teamMax1 = (inputs: GoalInputs) => {
  const xG = expectedGoalsForTeamA(inputs);
  // Comfortable that they don't explode for 2+
  return xG <= 0.8;
};

   export const teamMin1 = (inputs: GoalInputs) => {
    const xG = expectedGoalsForTeamA(inputs);
  
    // True when we reasonably expect 1+ goal
    return xG >= 1.4;
  };

  export const teamMax2 = (inputs: GoalInputs) => {
    const xG = expectedGoalsForTeamA(inputs);
    // From earlier: "we don't expect 3+"
    return xG <= 1.5;
  };

  export const teamMin2 = (inputs: GoalInputs) => {
    const xG = expectedGoalsForTeamA(inputs);
    // Strong expectation of 2+ goals
    return xG >= 2.3;
  };

  export const teamMax3 = (inputs: GoalInputs) => {
    const xG = expectedGoalsForTeamA(inputs);
    // Not expecting a 4+ goal performance
    return xG <= 2.5;
  };
  
  export const teamMin3 = (inputs: GoalInputs) => {
    const xG = expectedGoalsForTeamA(inputs);
    // Only true for very strong attacking expectation
    return xG >= 3.2;
  };

  export const teamMax4 = (inputs: GoalInputs) => {
    const xG = expectedGoalsForTeamA(inputs);
    // Not expecting a 5+ goal monster performance
    return xG <= 3.6;
  };
  
  export const teamMin4 = (inputs: GoalInputs) => {
    const xG = expectedGoalsForTeamA(inputs);
    // Only in crazy attacking matchups
    return xG >= 4.3;
  };

  export default {
    getLastFiveHomeTeamHomeFixtures,
    getLastFiveAwayTeamAwayFixtures,
    getH2HFixtures,
    HomeTeamScroreInMostHomeFixtures,
    awayTeamScroreInMostAwayFixtures,
    awayTeamFailScroringInMostAwayFixtures,
    homeTeamFailScroringInMostHomeFixtures,
    homeTeamFailWinningInMostHomeFixtures,
    awayTeamFailWinningInMostAwayFixtures,
    homeTeamMinGoals,
    awayTeamMinGoals,
    otherHomeTeamGoalsInAwayFixtures,
    otherAwayTeamGoalsInHomeFixtures,
    otherHomeTeamMinMaxGoalsInAwayFixtures,
    otherAwayTeamMinMaxGoalsInHomeFixtures,
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
    mostFixturesAreBTTS,
    teamWonLastFixture,
    teamDidNotLoseLastFixture,
    goodAwayTeamwinPercentage,
    goodHomeTeamwinPercentage,
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
    teamMin4
};
