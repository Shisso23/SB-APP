import { FixtureDataModel } from "../models/fixtures";
import { StandingsDataStandingModel, StandingsModel } from "../models/standings-models";
import { numberOfH2HMatchesBack, numberOTeamLastFixturesBack } from "../variables/variables";

export const getLastFiveTeamHomeFixtures = ({
    teamId,
    allFixtures,
  }: {
    teamId: number;
    allFixtures: FixtureDataModel[];
  }) => {
    return allFixtures
      .filter(fixture => {
        return (
          fixture.teams.home.id === teamId &&
          fixture.fixture.status.short === 'FT'
        );
      })
      .slice(0, numberOTeamLastFixturesBack)
      .sort((fixtureA, fixtureB) => {
        return fixtureB.fixture.timestamp - fixtureA.fixture.timestamp;
      });
  };
  
  export const getLastFiveTeamAwayFixtures = ({
    teamId,
    allFixtures,
  }: {
    teamId: number;
    allFixtures: FixtureDataModel[];
  }) => {
    return allFixtures
      .filter(fixture => {
        return (
          (fixture.teams.away.id === teamId ||
            fixture.teams.away.id === teamId) &&
          fixture.fixture.status.short === 'FT'
        );
      })
      .slice(0, numberOTeamLastFixturesBack)
      .sort((fixtureA, fixtureB) => {
        return fixtureB.fixture.timestamp - fixtureA.fixture.timestamp;
      });
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
    return allFixtures
      .filter(fixture => {
        return (
          (fixture.teams.home.id === teamOneId ||
            fixture.teams.away.id === teamOneId) &&
          (fixture.teams.home.id === teamTwoId ||
            fixture.teams.away.id === teamTwoId) &&
          fixture.fixture.status.short === 'FT'
        );
      })
      .slice(0, numberOfH2HMatchesBack)
      .sort((fixtureA, fixtureB) => {
        return fixtureB.fixture.timestamp - fixtureA.fixture.timestamp;
      }); //TODO verify there's enough h2h
  };
  
  export const HomeTeamScroreInMostHomeFixtures = ({
    homefixtures,
    minGoals,
  }: {
    homefixtures: FixtureDataModel[];
    minGoals: number;
  }) => {
    let conditionPassedCount = 0;
    homefixtures.forEach(fixtureData => {
      if (fixtureData.goals.home >= minGoals) {
        conditionPassedCount += 1;
      }
    });
    if (conditionPassedCount / homefixtures.length >= 0.75) {
      return true;
    } else {
      return false;
    }
  };
  
  export const awayTeamScroreInMostAwayFixtures = ({
    awayfixtures,
    minGoals,
  }: {
    awayfixtures: FixtureDataModel[];
    minGoals: number;
  }) => {
    let conditionPassedCount = 0;
    awayfixtures.forEach(fixtureData => {
      if (fixtureData.goals.away >= minGoals) {
        conditionPassedCount += 1;
      }
    });
    if (conditionPassedCount / awayfixtures.length >= 0.75) {
      return true;
    } else {
      return false;
    }
  };
  
  export const awayTeamFailScroringInMostAwayFixtures = ({
    awayfixtures,
  }: {
    awayfixtures: FixtureDataModel[];
  }) => {
    let conditionPassedCount = 0;
    awayfixtures.forEach(fixtureData => {
      if (fixtureData.goals.away < 1) {
        conditionPassedCount += 1;
      }
    });
    if (conditionPassedCount / awayfixtures.length >= 0.7) {
      return true;
    } else {
      return false;
    }
  };
  
  export const homeTeamFailScroringInMostHomeFixtures = ({
    homefixtures,
  }: {
    homefixtures: FixtureDataModel[];
  }) => {
    let conditionPassedCount = 0;
    homefixtures.forEach(fixtureData => {
      if (fixtureData.goals.home < 1) {
        conditionPassedCount += 1;
      }
    });
    if (conditionPassedCount / homefixtures.length >= 0.5) {
      return true;
    } else {
      return false;
    }
  };
  
  export const homeTeamFailWinningInMostHomeFixtures = ({
    homefixtures,
  }: {
    homefixtures: FixtureDataModel[];
  }) => {
    let conditionPassedCount = 0;
    homefixtures.forEach(fixtureData => {
      if (fixtureData.goals.home <= fixtureData.goals.away) {
        conditionPassedCount += 1;
      }
    });
    if (conditionPassedCount / homefixtures.length >= 0.7) {
      return true;
    } else {
      return false;
    }
  };
  
  export const awayTeamFailWinningInMostAwayFixtures = ({
    awayFixtures,
  }: {
    awayFixtures: FixtureDataModel[];
  }) => {
    let conditionPassedCount = 0;
    awayFixtures.forEach(fixtureData => {
      if (fixtureData.goals.away <= fixtureData.goals.home) {
        conditionPassedCount += 1;
      }
    });
    if (conditionPassedCount / awayFixtures.length >= 0.7) {
      return true;
    } else {
      return false;
    }
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
    let count = 0;
    homeTeamFixtures.forEach(fixture => {
      if (fixture.goals.home >= minGoals) {
        count += 1;
      }
    });
    if ((count / homeTeamFixtures.length) *100 >= occurencePercentage) {
      return true;
    }
    return false;
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
    let count = 0;
    awayTeamFixtures.forEach(fixture => {
      if (fixture.goals.away >= minGoals) {
        count += 1;
      }
    });
    if ((count / awayTeamFixtures.length )*100>= occurencePercentage) {
      return true;
    }
    return false;
  };
  
  export const otherHomeTeamGoalsInAwayFixtures = ({
    awayTeamFixtures,
    goals,
  }: {
    awayTeamFixtures: FixtureDataModel[];
    goals: number;
  }) => {
    let conditionPassedCount = 0;
    awayTeamFixtures.forEach(fixtureData => {
      if (fixtureData.goals.home >= goals) {
        conditionPassedCount += 1;
      }
    });
    if (conditionPassedCount / awayTeamFixtures.length >= 0.75) {
      return true;
    } else {
      return false;
    }
  };
  
  export const otherAwayTeamGoalsInHomeFixtures = ({
    homeTeamFixtures,
    goals,
  }: {
    homeTeamFixtures: FixtureDataModel[];
    goals: number;
  }) => {
    let conditionPassedCount = 0;
    homeTeamFixtures.forEach(fixtureData => {
      if (fixtureData.goals.away >= goals) {
        conditionPassedCount += 1;
      }
    });
    if (conditionPassedCount / homeTeamFixtures.length >= 0.75) {
      return true;
    } else {
      return false;
    }
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
    let conditionPassedCount = 0;
    awayTeamFixtures.forEach(fixtureData => {
      if (
        fixtureData.goals.home >= minGoals &&
        fixtureData.goals.home <= maxGoals
      ) {
        conditionPassedCount += 1;
      }
    });
    if (conditionPassedCount / awayTeamFixtures.length > 0.6) {
      return true;
    } else {
      return false;
    }
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
    let conditionPassedCount = 0;
    homeTeamFixtures.forEach(fixtureData => {
      if (
        fixtureData.goals.away >= minGoals &&
        fixtureData.goals.away <= maxGoals
      ) {
        conditionPassedCount += 1;
      }
    });
    if (conditionPassedCount / homeTeamFixtures.length > 0.6) {
      return true;
    } else {
      return false;
    }
  };
  
  export const homeTeamWinsMostMatches = ({
    fixtures,
    homeTeamId,
  }: {
    fixtures: FixtureDataModel[];
    homeTeamId: number;
  }) => {
    let conditionPassedCount = 0;
    fixtures.forEach(fixtureData => {
      if (
        (fixtureData.score.fulltime.home > fixtureData.score.fulltime.away &&
          fixtureData.teams.home.id === homeTeamId) ||
        (fixtureData.score.fulltime.away > fixtureData.score.fulltime.home &&
          fixtureData.teams.away.id === homeTeamId)
      ) {
        conditionPassedCount += 1;
      }
    });
    if (conditionPassedCount / fixtures.length >= 0.5) {
      return true;
    } else {
      return false;
    }
  };
  //  return false;
  //   }
  // };
  
  export const awayTeamWinsMostMatchesTimes = ({
    fixtures,
    awayTeamId,
  }: {
    fixtures: FixtureDataModel[];
    awayTeamId: number;
  }) => {
    let conditionPassedCount = 0;
    fixtures.forEach(fixtureData => {
      if (
        (fixtureData.score.fulltime.home > fixtureData.score.fulltime.away &&
          fixtureData.teams.home.id === awayTeamId) ||
        (fixtureData.score.fulltime.away > fixtureData.score.fulltime.home &&
          fixtureData.teams.away.id === awayTeamId)
      ) {
        conditionPassedCount += 1;
      }
    });
    if (conditionPassedCount / fixtures.length >= 0.5) {
      return true;
    } else {
      return false;
    }
  };
  
  export const filterByDate = (fixtures: FixtureDataModel[]) =>
    fixtures.sort((fixtureA, fixtureB) => {
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
    standings.forEach(standing => {
      standing?.response[0]?.league.standings.forEach(teamStanding_ => {
        teamStanding_.forEach(standing_ => {
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
    standings.forEach(standing => {
      standing.response[0]?.league.standings.forEach(teamStanding_ => {
        teamStanding_.forEach(standing_ => {
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
  
  
  
  
  export const awayTeamScroreInMostH2HFixtures =({h2hFixtures, minGoals, awayTeamId}: {h2hFixtures: FixtureDataModel[]; minGoals: number, awayTeamId: number })=>{
    let conditionPassedCount =0;
    h2hFixtures.forEach(fixtureData=> {
        if(((fixtureData.goals.home>= minGoals) && fixtureData.teams.home.id ===awayTeamId) || ((fixtureData.goals.away>= minGoals) && fixtureData.teams.away.id ===awayTeamId) ){
            conditionPassedCount+=1;
        }
  })
  if(((conditionPassedCount/h2hFixtures.length))>= 0.6){
      return true;
  }else{
      return false
  }
  }
  
  export const homeTeamScroreInMostH2HFixtures =({h2hFixtures, minGoals, homeTeamId}: {h2hFixtures: FixtureDataModel[]; minGoals: number, homeTeamId: number })=>{
    let conditionPassedCount =0;
    h2hFixtures.forEach(fixtureData=> {
      if(((fixtureData.goals.home>= minGoals) && fixtureData.teams.home.id ===homeTeamId) || ((fixtureData.goals.away>= minGoals) && fixtureData.teams.away.id ===homeTeamId) ){
          conditionPassedCount+=1;
      }
  })
  if(((conditionPassedCount/h2hFixtures.length))>=0.6){
      return true;
  }else{
      return false
  }
  }

  export const teamMinGoalsInH2H =({h2hFixtures, minGoals, teamId, occurencePercentage}: {h2hFixtures: FixtureDataModel[]; minGoals:number; teamId: number; occurencePercentage: number })=>{
    let conditionPassedCount =0;
    h2hFixtures.forEach(fixtureData=> {
      if(((fixtureData.goals.home>= minGoals) && fixtureData.teams.home.id ===teamId) || ((fixtureData.goals.away>= minGoals) && fixtureData.teams.away.id ===teamId) ){
          conditionPassedCount+=1;
      }
  })
  if(((conditionPassedCount/h2hFixtures.length)*100)>=occurencePercentage){
    return true;
}else{
    return false
}
  }

  export const teamMinMaxInH2H =({h2hFixtures, maxGoals, teamId, occurencePercentage}: {h2hFixtures: FixtureDataModel[]; maxGoals:number; teamId: number; occurencePercentage: number })=>{
    let conditionPassedCount =0;
    h2hFixtures.forEach(fixtureData=> {
      if(((fixtureData.goals.home<= maxGoals) && fixtureData.teams.home.id ===teamId) || ((fixtureData.goals.away<= maxGoals) && fixtureData.teams.away.id ===teamId) ){
          conditionPassedCount+=1;
      }
  })
  if(((conditionPassedCount/h2hFixtures.length)*100)>=occurencePercentage){
    return true;
}else{
    return false
}

}
  export const againstAwayTeamMinMax =({awayTeamFixtures, maxGoals, occurencePercentage}: {awayTeamFixtures: FixtureDataModel[]; maxGoals:number; occurencePercentage: number })=>{
    let conditionPassedCount =0;
    awayTeamFixtures.forEach(fixtureData=> {
      if((fixtureData.goals.home<= maxGoals) ){
          conditionPassedCount+=1;
      }
  })
  if(((conditionPassedCount/awayTeamFixtures.length)*100)>=occurencePercentage){
      return true;
  }else{
      return false
  }
  }

  export const againstHomeTeamMinMax =({homeTeamFixtures, maxGoals, occurencePercentage}: {homeTeamFixtures: FixtureDataModel[]; maxGoals:number,occurencePercentage: number })=>{
    let conditionPassedCount =0;
    homeTeamFixtures.forEach(fixtureData=> {
      if((fixtureData.goals.away<= maxGoals) ){
          conditionPassedCount+=1;
      }
  })
  if(((conditionPassedCount/homeTeamFixtures.length)*100)>=occurencePercentage){
      return true;
  }else{
      return false
  }
  }

  export const fixtureTotalMinMax =({fixtures, maxGoals, minGoals, occurencePercentage}: {fixtures: FixtureDataModel[]; maxGoals:number; minGoals:number; occurencePercentage: number })=>{
    let conditionPassedCount =0;
    fixtures.forEach(fixtureData=> {
      if((fixtureData.goals.away + fixtureData.goals.home >= minGoals && fixtureData.goals.away + fixtureData.goals.home <= maxGoals ) ){
          conditionPassedCount+=1;
      }
  })
  if(((conditionPassedCount/fixtures.length)*100)>=occurencePercentage){
      return true;
  }else{
      return false
  }
  }
  

  export default {
    getLastFiveTeamHomeFixtures,
    getLastFiveTeamAwayFixtures,
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
    awayTeamGoalsPercentage
  }