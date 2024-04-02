import { FixtureDataModel } from "../models/fixtures";
import { StandingsDataStandingModel, StandingsModel } from "../models/standings-models";
import { numberOfH2HMatchesBack, numberOTeamLastFixturesBack } from "../variables/variables";

export const getLastFiveHomeTeamHomeFixtures = ({
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
  
  export const getLastFiveAwayTeamAwayFixtures = ({
    teamId,
    allFixtures,
  }: {
    teamId: number;
    allFixtures: FixtureDataModel[];
  }) => {
    return allFixtures
      .filter(fixture => {
        return (
          (fixture.teams.away.id === teamId) &&
          fixture.fixture.status.short === 'FT'
        );
      })
      .slice(0, numberOTeamLastFixturesBack)
      .sort((fixtureA, fixtureB) => {
        return fixtureB.fixture.timestamp - fixtureA.fixture.timestamp;
      });
  };

  export const getLastFiveTeamFixtures = ({
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
            fixture.teams.home.id === teamId) &&
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
    if (conditionPassedCount / awayfixtures.length >= 0.45) {
      return true;
    } else {
      return false;
    }
  };

  export const teamDidNotWinLastFixture=({allPastFiveFixtures, teamId}: {allPastFiveFixtures: FixtureDataModel[], teamId: number })=>{
      if ((allPastFiveFixtures[0].teams.home.id=== teamId && allPastFiveFixtures[0].goals.home<= allPastFiveFixtures[0].goals.away)||
      allPastFiveFixtures[0].teams.away.id=== teamId && allPastFiveFixtures[0].goals.away<= allPastFiveFixtures[0].goals.home
      ){
        return true
      }
      return false
  }

  export const teamDidNotLoseLastFixture=({allPastFiveFixtures, teamId}: {allPastFiveFixtures: FixtureDataModel[], teamId: number })=>{
    if ((allPastFiveFixtures[0].teams.home.id=== teamId && allPastFiveFixtures[0].goals.home>= allPastFiveFixtures[0].goals.away)||
    allPastFiveFixtures[0].teams.away.id=== teamId && allPastFiveFixtures[0].goals.away>= allPastFiveFixtures[0].goals.home
    ){
      return true
    }
    return false
}

  export const teamWonLastFixture=({allPastFiveFixtures, teamId}: {allPastFiveFixtures: FixtureDataModel[], teamId: number })=>{
    if ((allPastFiveFixtures[0].teams.home.id=== teamId && allPastFiveFixtures[0].goals.home> allPastFiveFixtures[0].goals.away)||
    allPastFiveFixtures[0].teams.away.id=== teamId && allPastFiveFixtures[0].goals.away> allPastFiveFixtures[0].goals.home
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
    let conditionPassedCount = 0;
    homefixtures.forEach(fixtureData => {
      if (fixtureData.goals.home < 1) {
        conditionPassedCount += 1;
      }
    });
    if (conditionPassedCount / homefixtures.length >= 0.45) {
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
    if (conditionPassedCount / homefixtures.length >= 0.6) {
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
    if (conditionPassedCount / awayFixtures.length >= 0.6) {
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
    if (conditionPassedCount / awayTeamFixtures.length >=0.8) {
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
    if (conditionPassedCount / homeTeamFixtures.length >=0.8) {
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
    winPercentage = 60
  }: {
    fixtures: FixtureDataModel[];
    homeTeamId: number;
    winPercentage?: number
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
    if (conditionPassedCount / fixtures.length >= (winPercentage/100)) {
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
    winPercentage = 60
  }: {
    fixtures: FixtureDataModel[];
    awayTeamId: number;
    winPercentage?: number
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
    if (conditionPassedCount / fixtures.length >= (winPercentage/100)) {
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


  export const hasNoNilNilInFixtures  =({fixtures}:{fixtures: FixtureDataModel[]})=>{
    if (fixtures.every(fixture=> fixture.goals.home+ fixture.goals.away>=1)){
      return true
    }
    return false
  }
  
  
  
  
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

  export const mostFixturesAreBTTS =({fixtures, bttsPercentage=80}: {fixtures: FixtureDataModel[], bttsPercentage: number})=>{
  
    let conditionPassedCount =0;
    fixtures.forEach(fixtureData=> {
      if(((fixtureData.goals.home> 0 && fixtureData.goals.away>0)) ){
          conditionPassedCount+=1;
      }
    })
    if(((conditionPassedCount/fixtures.length)*100)>=bttsPercentage){
      return true;
    }else{
        return false
    }

  }
  


  export const goodAwayTeamwinPercentage =({awayStanding, homeStanding, winPercentage, lossPercentage}: {homeStanding: StandingsDataStandingModel, awayStanding: StandingsDataStandingModel, winPercentage: number, lossPercentage: number})=>{
  
   if ((awayStanding.all.win/ awayStanding.all.played)*100 >=winPercentage && (homeStanding.all.lose/homeStanding.all.played*100)>= lossPercentage){
    return true
   }
   return false
  }

  export const goodHomeTeamwinPercentage =({awayStanding, homeStanding, winPercentage, lossPercentage}: {homeStanding: StandingsDataStandingModel, awayStanding: StandingsDataStandingModel, winPercentage: number, lossPercentage: number})=>{
  
    if ((homeStanding.all.win/ homeStanding.all.played)*100 >=winPercentage && (awayStanding.all.lose/awayStanding.all.played*100)>= lossPercentage){
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
    return allFixtures
      .filter(fixture => {
        return (
          (fixture.teams.home.id === teamId) &&
          fixture.fixture.status.short === 'FT'
        );
      }).filter(fixture=> fixture.league.season === currentSeason)
      .sort((fixtureA, fixtureB) => {
        return fixtureB.fixture.timestamp - fixtureA.fixture.timestamp;
      });
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
    return allFixtures
      .filter(fixture => {
        return (
          (fixture.teams.away.id === teamId) &&
          fixture.fixture.status.short === 'FT'
        );
      }).filter(fixture=> fixture.league.season === currentSeason)
      .sort((fixtureA, fixtureB) => {
        return fixtureB.fixture.timestamp - fixtureA.fixture.timestamp;
      });
  };


  export const averageGoalsScoredAtHome = ({
    homeTeamHomeFixtures,
  }: {
    homeTeamHomeFixtures:  FixtureDataModel[];
  })=>{
    const lastFiveHomeTeamHomeFixtures = getLastFiveHomeTeamHomeFixtures({
      teamId: homeTeamHomeFixtures[0].teams.home.id,
      allFixtures: homeTeamHomeFixtures
    });
    return lastFiveHomeTeamHomeFixtures.reduce((goalsAverage, fixture)=>{
      return goalsAverage+ fixture.goals.home
    }, 0)/lastFiveHomeTeamHomeFixtures.length
  }

  export const averageGoalsConcededAtHome =({
    homeTeamHomeFixtures,
  }: {
    homeTeamHomeFixtures:  FixtureDataModel[];
  })=>{ const lastFiveHomeTeamHomeFixtures = getLastFiveHomeTeamHomeFixtures({
    teamId: homeTeamHomeFixtures[0].teams.home.id,
    allFixtures: homeTeamHomeFixtures
  });

    return lastFiveHomeTeamHomeFixtures.reduce((goalsAverage, fixture)=>{
      return goalsAverage+ fixture.goals.away
    }, 0)/lastFiveHomeTeamHomeFixtures.length
  }
 
  export const averageGoalsScoredAway =({
    awayTeamAwayFixtures,
  }: {
    awayTeamAwayFixtures:  FixtureDataModel[];
  })=>{
    const lastFiveAwayTeamAwayFixtures = getLastFiveAwayTeamAwayFixtures({
      teamId: awayTeamAwayFixtures[0].teams.away.id,
      allFixtures: awayTeamAwayFixtures,
    });
    return lastFiveAwayTeamAwayFixtures.reduce((goalsAverage, fixture)=>{
      return goalsAverage+ fixture.goals.away
    }, 0)/lastFiveAwayTeamAwayFixtures.length
  }

  export const averageGoalsConcededAway =({
    awayTeamAwayFixtures,
  }: {
    awayTeamAwayFixtures:  FixtureDataModel[];
  })=>{
    const lastFiveAwayTeamAwayFixtures = getLastFiveAwayTeamAwayFixtures({
      teamId: awayTeamAwayFixtures[0].teams.away.id,
      allFixtures: awayTeamAwayFixtures,
    });
    return lastFiveAwayTeamAwayFixtures.reduce((goalsAverage, fixture)=>{
      return goalsAverage+ fixture.goals.home
    }, 0)/lastFiveAwayTeamAwayFixtures.length
  }

  export const teamMin0 =({teamAAverageGoalsScored, teamBAverageGoalsConceded}:{teamAAverageGoalsScored: number, teamBAverageGoalsConceded: number})=>{
   return (teamAAverageGoalsScored<=1.2 && teamBAverageGoalsConceded<0.8)
  }

  export const teamMax0 =({teamAAverageGoalsScored, teamBAverageGoalsConceded}:{teamAAverageGoalsScored: number, teamBAverageGoalsConceded: number})=>{
    return (teamAAverageGoalsScored<=0.8 && teamBAverageGoalsConceded<=0.8)
   }

  export const teamMax1 =({teamAAverageGoalsScored, teamBAverageGoalsConceded}:{teamAAverageGoalsScored: number, teamBAverageGoalsConceded: number})=>{
    return (teamAAverageGoalsScored<=1.2 && teamBAverageGoalsConceded<1.1) ||
    (teamAAverageGoalsScored<=1.5 && teamBAverageGoalsConceded<= 0.8)||
    (teamAAverageGoalsScored<=0.8 && teamBAverageGoalsConceded< 1.5)
   }

  export const teamMin1 =({teamAAverageGoalsScored, teamBAverageGoalsConceded}:{teamAAverageGoalsScored: number, teamBAverageGoalsConceded: number})=>{
    // return (teamAAverageGoalsScored>=1 && teamBAverageGoalsConceded>= 1.9) ||
    // (teamAAverageGoalsScored >= 1.8 && teamBAverageGoalsConceded>= 1.5) ||
    // (teamAAverageGoalsScored >= 1.8 && teamBAverageGoalsConceded>= 1.4)||
    // (teamAAverageGoalsScored >= 2 && teamBAverageGoalsConceded>= 1)
   return (teamAAverageGoalsScored >= 1.3 && teamBAverageGoalsConceded>= 1.8)

  }

  export const teamMax2 =({teamAAverageGoalsScored, teamBAverageGoalsConceded}:{teamAAverageGoalsScored: number, teamBAverageGoalsConceded: number})=>{
    return (((teamAAverageGoalsScored+teamBAverageGoalsConceded)/2) + 1) <= 2
  }

  export const teamMin2 =({teamAAverageGoalsScored, teamBAverageGoalsConceded}:{teamAAverageGoalsScored: number, teamBAverageGoalsConceded: number})=>{
    // return (teamAAverageGoalsScored >= 1.8 && teamBAverageGoalsConceded>= 2.2) ||
    // (teamAAverageGoalsScored >= 1.9 && teamBAverageGoalsConceded>= 2)||
    // (teamAAverageGoalsScored >= 2.1 && teamBAverageGoalsConceded>= 1.8)||
    // (teamAAverageGoalsScored >= 2.4 && teamBAverageGoalsConceded>= 1.4)
    return  (teamAAverageGoalsScored >= 1.8 && teamBAverageGoalsConceded>= 2)
  }

  export const teamMax3 =({teamAAverageGoalsScored, teamBAverageGoalsConceded}:{teamAAverageGoalsScored: number, teamBAverageGoalsConceded: number})=>{
    return (((teamAAverageGoalsScored+teamBAverageGoalsConceded)/2) + 1) <= 3
  }

  export const teamMin3 =({teamAAverageGoalsScored, teamBAverageGoalsConceded}:{teamAAverageGoalsScored: number, teamBAverageGoalsConceded: number})=>{
    // return (teamAAverageGoalsScored >= 2.5 && teamBAverageGoalsConceded>= 2) ||
    // (teamAAverageGoalsScored >= 2 && teamBAverageGoalsConceded>= 2.5)||
    // (teamAAverageGoalsScored >= 1.8 && teamBAverageGoalsConceded>= 3)
    return (teamAAverageGoalsScored >= 3.2 && teamBAverageGoalsConceded>= 2)
  }

  export const teamMax4 =({teamAAverageGoalsScored, teamBAverageGoalsConceded}:{teamAAverageGoalsScored: number, teamBAverageGoalsConceded: number})=>{
    return (((teamAAverageGoalsScored+teamBAverageGoalsConceded)/2) + 1) <= 4
  }

  export const teamMin4 =({teamAAverageGoalsScored, teamBAverageGoalsConceded}:{teamAAverageGoalsScored: number, teamBAverageGoalsConceded: number})=>{
    // return (teamAAverageGoalsScored >= 2.8 && teamBAverageGoalsConceded>= 3.2) ||
    // (teamAAverageGoalsScored >= 2.5 && teamBAverageGoalsConceded>= 3.6)||
    // (teamAAverageGoalsScored >= 3.5 && teamBAverageGoalsConceded>= 2.8)
    return (teamAAverageGoalsScored >= 4 && teamBAverageGoalsConceded>= 2.5)
  }


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
  }