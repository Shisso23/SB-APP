import { FixtureDataModel } from "../models/fixtures";
import { betOptions, numberOfH2HMatchesBack, numberOTeamLastFixturesBack } from "../variables/variables";


// TODO sort fixtures by dates. Latest first 

export const predictOver1_5 =({currentFixtures, allFixtures}:{currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=>{
    const predictedFixtures= currentFixtures.filter(currentFixture=>{
        const lastFiveHomeFixtures =  getLastFiveTeamHomeFixtures({teamId: currentFixture.teams.home.id, allFixtures});
        const lastFiveAwayFixtures =  getLastFiveTeamAwayFixtures({teamId: currentFixture.teams.away.id, allFixtures});
        const fixtureH2hFixtures = getH2HFixtures({teamOneId: currentFixture.teams.home.id, teamTwoId: currentFixture.teams.away.id, allFixtures})
        //Get last 5 home/ away games
       
        
        
        // filter the fixtures that passes the over 1.5 test here and return it
       return true
    })
    return {fixtures: predictedFixtures, option: betOptions.find(option=> option.id===3) }// can look into making that betoption a enum
}

export const predictOver2_5 =({currentFixtures, allFixtures}:{currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=>{
    const predictedFixtures= currentFixtures.filter(currentFixture=>{
        const lastFiveHomeFixtures =  getLastFiveTeamHomeFixtures({teamId: currentFixture.teams.home.id, allFixtures});
        const lastFiveAwayFixtures =  getLastFiveTeamAwayFixtures({teamId: currentFixture.teams.away.id, allFixtures});
        const fixtureH2hFixtures = getH2HFixtures({teamOneId: currentFixture.teams.home.id, teamTwoId: currentFixture.teams.away.id, allFixtures})
        //Get last 5 home/ away games
       
        
        
        // filter the fixtures that passes the over 1.5 test here and return it
       return true
    })
    return {fixtures: predictedFixtures, option: betOptions.find(option=> option.id===4) }// can look into making that betoption a enum
}


export const predictBothTeamsToScore =({currentFixtures, allFixtures}:{currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=>{
    const predictedFixtures= currentFixtures.filter(currentFixture=>{
        const lastFiveHomeFixtures =  getLastFiveTeamHomeFixtures({teamId: currentFixture.teams.home.id, allFixtures});
        const lastFiveAwayFixtures =  getLastFiveTeamAwayFixtures({teamId: currentFixture.teams.away.id, allFixtures});
        const fixtureH2hFixtures = getH2HFixtures({teamOneId: currentFixture.teams.home.id, teamTwoId: currentFixture.teams.away.id, allFixtures})
       
        
        
        //TODO filter the fixtures that passes the GG test here and return it
       return (lastFiveHomeFixtures.every(fixtureData=> fixtureData.goals.home>0) && lastFiveAwayFixtures.every(fixtureData=> fixtureData.goals.away>0)) && fixtureH2hFixtures.every(fixtureData=> fixtureData.goals.home>0 &&fixtureData.goals.away>0)
    })
    return {fixtures: predictedFixtures, option: betOptions.find(option=> option.id===0) }//TODO can look into making that betoption a enum
}

export const predictHomeWinsEitherHalf =({currentFixtures, allFixtures}:{currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=>{
    const predictedFixtures= currentFixtures.filter(currentFixture=>{
        const lastFiveHomeFixtures =  getLastFiveTeamHomeFixtures({teamId: currentFixture.teams.home.id, allFixtures});
        const lastFiveAwayFixtures =  getLastFiveTeamAwayFixtures({teamId: currentFixture.teams.away.id, allFixtures});
        const fixtureH2hFixtures = getH2HFixtures({teamOneId: currentFixture.teams.home.id, teamTwoId: currentFixture.teams.away.id, allFixtures})
       
        
        
        //TODO filter the fixtures that passes the H wins either half test here and return it
       return (lastFiveHomeFixtures.every(FixtureData=> FixtureData.goals.home> FixtureData.goals.away))
    })
    return {fixtures: predictedFixtures, option: betOptions.find(option=> option.id===5) }//TODO can look into making that betoption a enum
}

export const predictAwayWinsEitherHalf =({currentFixtures, allFixtures}:{currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=>{
    const predictedFixtures= currentFixtures.filter(currentFixture=>{
        const lastFiveHomeFixtures =  getLastFiveTeamHomeFixtures({teamId: currentFixture.teams.home.id, allFixtures});
        const lastFiveAwayFixtures =  getLastFiveTeamAwayFixtures({teamId: currentFixture.teams.away.id, allFixtures});
        const fixtureH2hFixtures = getH2HFixtures({teamOneId: currentFixture.teams.home.id, teamTwoId: currentFixture.teams.away.id, allFixtures})
       
        
        
        //TODO filter the fixtures that passes the H wins either half test here and return it
       return (lastFiveAwayFixtures.every(FixtureData=> FixtureData.goals.away> FixtureData.goals.home))
    })
    return {fixtures: predictedFixtures, option: betOptions.find(option=> option.id===14) }//TODO can look into making that betoption id a enum
}

export const predictHomeWin =({currentFixtures, allFixtures}:{currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=>{
    const predictedFixtures= currentFixtures.filter(currentFixture=>{
        const lastFiveHomeFixtures =  getLastFiveTeamHomeFixtures({teamId: currentFixture.teams.home.id, allFixtures});
        const lastFiveAwayFixtures =  getLastFiveTeamAwayFixtures({teamId: currentFixture.teams.away.id, allFixtures});
        const fixtureH2hFixtures = getH2HFixtures({teamOneId: currentFixture.teams.home.id, teamTwoId: currentFixture.teams.away.id, allFixtures})
       
        
        
        //TODO filter the fixtures that passes the H wins either half test here and return it
       return (lastFiveHomeFixtures.every(FixtureData=> FixtureData.goals.away> FixtureData.goals.home)) && fixtureH2hFixtures.every(fixtureData=> fixtureData.teams.home.winner === true )
    })
    return {fixtures: predictedFixtures, option: betOptions.find(option=> option.id===1) }//TODO can look into making that betoption id a enum
}


export const predictAwayWin =({currentFixtures, allFixtures}:{currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=>{
    const predictedFixtures= currentFixtures.filter(currentFixture=>{
        const lastFiveHomeFixtures =  getLastFiveTeamHomeFixtures({teamId: currentFixture.teams.home.id, allFixtures});
        const lastFiveAwayFixtures =  getLastFiveTeamAwayFixtures({teamId: currentFixture.teams.away.id, allFixtures});
        const fixtureH2hFixtures = getH2HFixtures({teamOneId: currentFixture.teams.home.id, teamTwoId: currentFixture.teams.away.id, allFixtures})
       
        
        
        //TODO filter the fixtures that passes the H wins either half test here and return it
        return (lastFiveHomeFixtures.every(FixtureData=> FixtureData.goals.away> FixtureData.goals.home)) && fixtureH2hFixtures.every(fixtureData=> fixtureData.teams.home.winner === true )
    })
    return {fixtures: predictedFixtures, option: betOptions.find(option=> option.id===12) }//TODO can look into making that betoption id a enum
}

export const predictHomeOver1_5 =({currentFixtures, allFixtures}:{currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=>{
    const predictedFixtures= currentFixtures.filter(currentFixture=>{
        const lastFiveHomeFixtures =  getLastFiveTeamHomeFixtures({teamId: currentFixture.teams.home.id, allFixtures});
        const lastFiveAwayFixtures =  getLastFiveTeamAwayFixtures({teamId: currentFixture.teams.away.id, allFixtures});
        const fixtureH2hFixtures = getH2HFixtures({teamOneId: currentFixture.teams.home.id, teamTwoId: currentFixture.teams.away.id, allFixtures})
       
        
        
        //TODO filter the fixtures that passes the H wins either half test here and return it
       return (lastFiveHomeFixtures.every(FixtureData=> FixtureData.goals.home>= 2)) && fixtureH2hFixtures.every(fixtureData=> fixtureData.goals.home >=2)
    })
    return {fixtures: predictedFixtures, option: betOptions.find(option=> option.id===2) }//TODO can look into making that betoption id a enum
}
export const predictMultiGoals2_5 =({currentFixtures, allFixtures}:{currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=>{
    const predictedFixtures= currentFixtures.filter(currentFixture=>{
        const lastFiveHomeFixtures =  getLastFiveTeamHomeFixtures({teamId: currentFixture.teams.home.id, allFixtures});
        const lastFiveAwayFixtures =  getLastFiveTeamAwayFixtures({teamId: currentFixture.teams.away.id, allFixtures});
        const fixtureH2hFixtures = getH2HFixtures({teamOneId: currentFixture.teams.home.id, teamTwoId: currentFixture.teams.away.id, allFixtures})
        //Get last 5 home/ away games
       
        
        
        // filter the fixtures that passes the over 1.5 test here and return it
       return (lastFiveHomeFixtures.every(FixtureData=> FixtureData.goals.home + FixtureData.goals.away>=2 && FixtureData.goals.home + FixtureData.goals.away<=5 )) && 
       lastFiveAwayFixtures.every(FixtureData=> FixtureData.goals.away + FixtureData.goals.home>=2 && FixtureData.goals.home + FixtureData.goals.away<=5 )
    })
    return {fixtures: predictedFixtures, option: betOptions.find(option=> option.id===6) }// can look into making that betoption a enum
}

export const predictMultiGoals3_6 =({currentFixtures, allFixtures}:{currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=>{
    const predictedFixtures= currentFixtures.filter(currentFixture=>{
        const lastFiveHomeFixtures =  getLastFiveTeamHomeFixtures({teamId: currentFixture.teams.home.id, allFixtures});
        const lastFiveAwayFixtures =  getLastFiveTeamAwayFixtures({teamId: currentFixture.teams.away.id, allFixtures});
        const fixtureH2hFixtures = getH2HFixtures({teamOneId: currentFixture.teams.home.id, teamTwoId: currentFixture.teams.away.id, allFixtures})
        //Get last 5 home/ away games
       
        
        
        // filter the fixtures that passes the over 1.5 test here and return it
       return (lastFiveHomeFixtures.every(FixtureData=> FixtureData.goals.home + FixtureData.goals.away>=3 && FixtureData.goals.home + FixtureData.goals.away<=6 )) && 
       lastFiveAwayFixtures.every(FixtureData=> FixtureData.goals.away + FixtureData.goals.home>=3 && FixtureData.goals.home + FixtureData.goals.away<=6 )
    })
    return {fixtures: predictedFixtures, option: betOptions.find(option=> option.id===7) }// can look into making that betoption a enum
}

export const predictBothHalVOver0_5 =({currentFixtures, allFixtures}:{currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=>{
    const predictedFixtures= currentFixtures.filter(currentFixture=>{
        const lastFiveHomeFixtures =  getLastFiveTeamHomeFixtures({teamId: currentFixture.teams.home.id, allFixtures});
        const lastFiveAwayFixtures =  getLastFiveTeamAwayFixtures({teamId: currentFixture.teams.away.id, allFixtures});
        const fixtureH2hFixtures = getH2HFixtures({teamOneId: currentFixture.teams.home.id, teamTwoId: currentFixture.teams.away.id, allFixtures})
        //Get last 5 home/ away games
       
        
        
        // filter the fixtures that passes the over 1.5 test here and return it
       return fixtureH2hFixtures.every(fixtureData=> fixtureData.goals.away + fixtureData.goals.away > 3) && 
       lastFiveHomeFixtures.every(fixtureData=> fixtureData.goals.away + fixtureData.goals.away > 3) && lastFiveAwayFixtures.every(fixtureData=> fixtureData.goals.away + fixtureData.goals.away > 3)
    })
    return {fixtures: predictedFixtures, option: betOptions.find(option=> option.id===8) }// can look into making that betoption a enum
}

export const predictDrawOrGoal =({currentFixtures, allFixtures}:{currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=>{
    const predictedFixtures= currentFixtures.filter(currentFixture=>{
        const lastFiveHomeFixtures =  getLastFiveTeamHomeFixtures({teamId: currentFixture.teams.home.id, allFixtures});
        const lastFiveAwayFixtures =  getLastFiveTeamAwayFixtures({teamId: currentFixture.teams.away.id, allFixtures});
        const fixtureH2hFixtures = getH2HFixtures({teamOneId: currentFixture.teams.home.id, teamTwoId: currentFixture.teams.away.id, allFixtures})
        //Get last 5 home/ away games
       
        
        
        // filter the fixtures that passes the over 1.5 test here and return it
       return (lastFiveHomeFixtures.every(fixtureData=> fixtureData.score.fulltime.home>0) && lastFiveAwayFixtures.every(fixtureData=> fixtureData.score.fulltime.away>0)) && fixtureH2hFixtures.every(fixtureData=> fixtureData.goals.home>0 &&fixtureData.goals.away>0) ||
       fixtureH2hFixtures.every(fixtureData=> !fixtureData.teams.home.winner &&  !fixtureData.teams.away.winner)
    })
    return {fixtures: predictedFixtures, option: betOptions.find(option=> option.id===9) }// can look into making that betoption a enum
}

export const predictDraw =({currentFixtures, allFixtures}:{currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=>{
    const predictedFixtures= currentFixtures.filter(currentFixture=>{
        const lastFiveHomeFixtures =  getLastFiveTeamHomeFixtures({teamId: currentFixture.teams.home.id, allFixtures});
        const lastFiveAwayFixtures =  getLastFiveTeamAwayFixtures({teamId: currentFixture.teams.away.id, allFixtures});
        const fixtureH2hFixtures = getH2HFixtures({teamOneId: currentFixture.teams.home.id, teamTwoId: currentFixture.teams.away.id, allFixtures})
        //Get last 5 home/ away games
    
        // filter the fixtures that passes the over 1.5 test here and return it
       return  fixtureH2hFixtures.every(fixtureData=> !fixtureData.teams.home.winner &&  !fixtureData.teams.away.winner)
    })
    return {fixtures: predictedFixtures, option: betOptions.find(option=> option.id===10) }// can look into making that betoption a enum
}

export const predictHTDraw =({currentFixtures, allFixtures}:{currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=>{
    const predictedFixtures= currentFixtures.filter(currentFixture=>{
        const lastFiveHomeFixtures =  getLastFiveTeamHomeFixtures({teamId: currentFixture.teams.home.id, allFixtures});
        const lastFiveAwayFixtures =  getLastFiveTeamAwayFixtures({teamId: currentFixture.teams.away.id, allFixtures});
        const fixtureH2hFixtures = getH2HFixtures({teamOneId: currentFixture.teams.home.id, teamTwoId: currentFixture.teams.away.id, allFixtures})
        //Get last 5 home/ away games
       
        
        
        // filter the fixtures that passes the over 1.5 test here and return it
        console.log({})
       return fixtureH2hFixtures.every(fixtureData=> fixtureData.score.halftime.home === fixtureData.score.halftime.away) 
    })
    return {fixtures: predictedFixtures, option: betOptions.find(option=> option.id===11) }// can look into making that betoption a enum
}

export const predictAwayOver1_5 =({currentFixtures, allFixtures}:{currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=>{
    const predictedFixtures= currentFixtures.filter(currentFixture=>{
        const lastFiveHomeFixtures =  getLastFiveTeamHomeFixtures({teamId: currentFixture.teams.home.id, allFixtures});
        const lastFiveAwayFixtures =  getLastFiveTeamAwayFixtures({teamId: currentFixture.teams.away.id, allFixtures});
        const fixtureH2hFixtures = getH2HFixtures({teamOneId: currentFixture.teams.home.id, teamTwoId: currentFixture.teams.away.id, allFixtures})
        //Get last 5 home/ away games
       
        
        
        // filter the fixtures that passes the over 1.5 test here and return it
       return (lastFiveAwayFixtures.every(FixtureData=> FixtureData.goals.away>= 2)) && fixtureH2hFixtures.every(fixtureData=> fixtureData.goals.away >=2)
    })
    return {fixtures: predictedFixtures, option: betOptions.find(option=> option.id===13) }// can look into making that betoption a enum
}

export const predictHomeOver0_5 =({currentFixtures, allFixtures}:{currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=>{
    const predictedFixtures= currentFixtures.filter(currentFixture=>{
        const lastFiveHomeFixtures =  getLastFiveTeamHomeFixtures({teamId: currentFixture.teams.home.id, allFixtures});
        const lastFiveAwayFixtures =  getLastFiveTeamAwayFixtures({teamId: currentFixture.teams.away.id, allFixtures});
        const fixtureH2hFixtures = getH2HFixtures({teamOneId: currentFixture.teams.home.id, teamTwoId: currentFixture.teams.away.id, allFixtures})
        //Get last 5 home/ away games
       
        
        
        // filter the fixtures that passes the over 1.5 test here and return it
       return (lastFiveHomeFixtures.every(FixtureData=> FixtureData.goals.home>= 1)) && fixtureH2hFixtures.every(fixtureData=> fixtureData.goals.home >=1)
    })
    return {fixtures: predictedFixtures, option: betOptions.find(option=> option.id===15) }// can look into making that betoption a enum
}

export const predictAwayOver0_5 =({currentFixtures, allFixtures}:{currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=>{
    const predictedFixtures= currentFixtures.filter(currentFixture=>{
        const lastFiveHomeFixtures =  getLastFiveTeamHomeFixtures({teamId: currentFixture.teams.home.id, allFixtures});
        const lastFiveAwayFixtures =  getLastFiveTeamAwayFixtures({teamId: currentFixture.teams.away.id, allFixtures});
        const fixtureH2hFixtures = getH2HFixtures({teamOneId: currentFixture.teams.home.id, teamTwoId: currentFixture.teams.away.id, allFixtures})
        //Get last 5 home/ away games
       
        
        
        // filter the fixtures that passes the over 1.5 test here and return it
       return (lastFiveAwayFixtures.every(FixtureData=> FixtureData.goals.away>= 1)) && fixtureH2hFixtures.every(fixtureData=> fixtureData.goals.away >=1)
    })
    return {fixtures: predictedFixtures, option: betOptions.find(option=> option.id===16) }// can look into making that betoption a enum
}

export const getLastFiveTeamHomeFixtures = ({teamId, allFixtures}: {teamId: number, allFixtures: FixtureDataModel[]})=>{
    return allFixtures.filter(fixture=>{
      return (fixture.teams.home.id === teamId) && fixture.fixture.status.short ==='FT'
    }).slice(0, numberOTeamLastFixturesBack)
  }

  export const getLastFiveTeamAwayFixtures = ({teamId, allFixtures}: {teamId: number, allFixtures: FixtureDataModel[]})=>{
    return allFixtures.filter(fixture=>{
      return (fixture.teams.away.id === teamId || fixture.teams.away.id === teamId) && fixture.fixture.status.short ==='FT'
    }).slice(0, numberOTeamLastFixturesBack)
  }
  
  export const getH2HFixtures =({teamOneId, teamTwoId, allFixtures}: {teamOneId: number, teamTwoId: number, allFixtures: FixtureDataModel[] })=>{
      return allFixtures.filter(fixture=>{
          return ((fixture.teams.home.id === teamOneId || fixture.teams.away.id === teamOneId) &&
          (fixture.teams.home.id === teamTwoId || fixture.teams.away.id === teamTwoId)) && fixture.fixture.status.short ==='FT'
      }).slice(0, numberOfH2HMatchesBack) //TODO verify there's enough h2h
  }