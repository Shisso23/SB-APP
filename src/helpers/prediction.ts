import { FixtureDataModel } from "../models/fixtures";
import { betOptions, numberOfH2HMatchesBack, numberOTeamLastFixturesBack } from "../variables/variables";


export const predictOver1_5 =({currentFixtures, allFixtures}:{currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=>{
    const predictedFixtures= currentFixtures.filter(currentFixture=>{
        const lastFiveHomeTeamHomeFixtures =  getLastFiveTeamHomeFixtures({teamId: currentFixture.teams.home.id, allFixtures});
        const lastFiveAwayTeamAwayFixtures =  getLastFiveTeamAwayFixtures({teamId: currentFixture.teams.away.id, allFixtures});
        const fixtureH2hFixtures = getH2HFixtures({teamOneId: currentFixture.teams.home.id, teamTwoId: currentFixture.teams.away.id, allFixtures})
        if(lastFiveHomeTeamHomeFixtures.length < 3 || lastFiveAwayTeamAwayFixtures.length < 3){
            return false
        }
       return ((HomeTeamScroreInMostHomeFixtures({homefixtures: lastFiveHomeTeamHomeFixtures, minGoals: 2}) && otherHomeTeamGoalsInAwayFixtures({awayTeamFixtures: lastFiveAwayTeamAwayFixtures, goals: 1}) )||
     (  awayTeamScroreInMostAwayFixtures({awayfixtures: lastFiveAwayTeamAwayFixtures, minGoals: 2}) && otherAwayTeamGoalsInHomeFixtures({homeTeamFixtures: lastFiveHomeTeamHomeFixtures, goals: 1}))) || 
     ((HomeTeamScroreInMostHomeFixtures({homefixtures: lastFiveHomeTeamHomeFixtures, minGoals: 1}) && otherHomeTeamGoalsInAwayFixtures({awayTeamFixtures: lastFiveAwayTeamAwayFixtures, goals: 1}) )&&
     (  awayTeamScroreInMostAwayFixtures({awayfixtures: lastFiveAwayTeamAwayFixtures, minGoals: 1}) && otherAwayTeamGoalsInHomeFixtures({homeTeamFixtures: lastFiveHomeTeamHomeFixtures, goals: 1})))
    })
    return {fixtures: predictedFixtures, option: betOptions.find(option=> option.id===3) }// can look into making that betoption a enum
}

export const predictOver2_5 =({currentFixtures, allFixtures}:{currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=>{
    const predictedFixtures= currentFixtures.filter(currentFixture=>{
        const lastFiveHomeTeamHomeFixtures =  getLastFiveTeamHomeFixtures({teamId: currentFixture.teams.home.id, allFixtures});
        const lastFiveAwayTeamAwayFixtures =  getLastFiveTeamAwayFixtures({teamId: currentFixture.teams.away.id, allFixtures});
        const fixtureH2hFixtures = getH2HFixtures({teamOneId: currentFixture.teams.home.id, teamTwoId: currentFixture.teams.away.id, allFixtures})

        if(lastFiveHomeTeamHomeFixtures.length <3 || lastFiveAwayTeamAwayFixtures.length < 3){
            return false
        }
        return HomeTeamScroreInMostHomeFixtures({homefixtures: lastFiveHomeTeamHomeFixtures, minGoals: 2}) && awayTeamScroreInMostAwayFixtures({awayfixtures: lastFiveAwayTeamAwayFixtures, minGoals: 2})
    })
    return {fixtures: predictedFixtures, option: betOptions.find(option=> option.id===4) }// can look into making that betoption a enum
}


export const predictBothTeamsToScore =({currentFixtures, allFixtures}:{currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=>{
    const predictedFixtures= currentFixtures.filter(currentFixture=>{
        const lastFiveHomeTeamHomeFixtures =  getLastFiveTeamHomeFixtures({teamId: currentFixture.teams.home.id, allFixtures});
        const lastFiveAwayTeamAwayFixtures =  getLastFiveTeamAwayFixtures({teamId: currentFixture.teams.away.id, allFixtures});
        const fixtureH2hFixtures = getH2HFixtures({teamOneId: currentFixture.teams.home.id, teamTwoId: currentFixture.teams.away.id, allFixtures})
        
        if(lastFiveHomeTeamHomeFixtures.length <3 || lastFiveAwayTeamAwayFixtures.length < 3){
            return false
        }
       return ( (awayTeamScroreInMostAwayFixtures({awayfixtures: lastFiveAwayTeamAwayFixtures, minGoals: 1}))
       && (otherAwayTeamGoalsInHomeFixtures({homeTeamFixtures: lastFiveHomeTeamHomeFixtures, goals: 1}))) && 
       ( (HomeTeamScroreInMostHomeFixtures({homefixtures: lastFiveHomeTeamHomeFixtures, minGoals: 1}))
       && (otherHomeTeamGoalsInAwayFixtures({awayTeamFixtures: lastFiveAwayTeamAwayFixtures, goals: 1}))) || 
       (homeTeamScroreInMostH2HFixtures({h2hFixtures: fixtureH2hFixtures,homeTeamId: currentFixture.teams.home.id, minGoals: 1}) && awayTeamScroreInMostH2HFixtures({h2hFixtures: fixtureH2hFixtures,awayTeamId: currentFixture.teams.away.id, minGoals: 1}) && fixtureH2hFixtures.length>=3)
    })
    return {fixtures: predictedFixtures, option: betOptions.find(option=> option.id===0) }//TODO can look into making that betoption a enum
}

export const predictHomeWinsEitherHalf =({currentFixtures, allFixtures}:{currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=>{
    const predictedFixtures= currentFixtures.filter(currentFixture=>{
        const lastFiveHomeTeamHomeFixtures =  getLastFiveTeamHomeFixtures({teamId: currentFixture.teams.home.id, allFixtures});
        const lastFiveAwayTeamAwayFixtures =  getLastFiveTeamAwayFixtures({teamId: currentFixture.teams.away.id, allFixtures});
        const fixtureH2hFixtures = getH2HFixtures({teamOneId: currentFixture.teams.home.id, teamTwoId: currentFixture.teams.away.id, allFixtures})

        if(lastFiveHomeTeamHomeFixtures.length < 3){
            return false
        }
        ((homeTeamWinsMostMatches({fixtures: lastFiveHomeTeamHomeFixtures, homeTeamId: currentFixture.teams.home.id}) && (otherHomeTeamGoalsInAwayFixtures({awayTeamFixtures: lastFiveAwayTeamAwayFixtures, goals: 1}))) &&
        ((awayTeamFailWinningInMostAwayFixtures({awayFixtures: lastFiveAwayTeamAwayFixtures})) )) ||
         (awayTeamFailScroringInMostAwayFixtures({awayfixtures: lastFiveAwayTeamAwayFixtures}) && HomeTeamScroreInMostHomeFixtures({homefixtures: lastFiveHomeTeamHomeFixtures, minGoals: 1}))
    })
    return {fixtures: predictedFixtures, option: betOptions.find(option=> option.id===5) }//TODO can look into making that betoption a enum
}

export const predictAwayWinsEitherHalf =({currentFixtures, allFixtures}:{currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=>{
    const predictedFixtures= currentFixtures.filter(currentFixture=>{
        const lastFiveHomeTeamHomeFixtures =  getLastFiveTeamHomeFixtures({teamId: currentFixture.teams.home.id, allFixtures});
        const lastFiveAwayTeamAwayFixtures =  getLastFiveTeamAwayFixtures({teamId: currentFixture.teams.away.id, allFixtures});
        const fixtureH2hFixtures = getH2HFixtures({teamOneId: currentFixture.teams.home.id, teamTwoId: currentFixture.teams.away.id, allFixtures})
        if(lastFiveAwayTeamAwayFixtures.length <3){
            return false
        }
        return ((awayTeamWinsMostMatchesTimes({fixtures: lastFiveAwayTeamAwayFixtures, awayTeamId: currentFixture.teams.away.id}) && (otherAwayTeamGoalsInHomeFixtures({homeTeamFixtures: lastFiveHomeTeamHomeFixtures, goals: 1}))) &&
        (homeTeamFailWinningInMostHomeFixtures({homefixtures:lastFiveHomeTeamHomeFixtures}) )) ||
         (homeTeamFailScroringInMostHomeFixtures({homefixtures: lastFiveHomeTeamHomeFixtures}) && awayTeamScroreInMostAwayFixtures({awayfixtures: lastFiveAwayTeamAwayFixtures, minGoals: 1}))
    })
    return {fixtures: predictedFixtures, option: betOptions.find(option=> option.id===14) }//TODO can look into making that betoption id a enum
}

export const predictHomeWin =({currentFixtures, allFixtures}:{currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=>{
    const predictedFixtures= currentFixtures.filter(currentFixture=>{
        const lastFiveHomeTeamHomeFixtures =  getLastFiveTeamHomeFixtures({teamId: currentFixture.teams.home.id, allFixtures});
        const lastFiveAwayTeamAwayFixtures =  getLastFiveTeamAwayFixtures({teamId: currentFixture.teams.away.id, allFixtures});
        const fixtureH2hFixtures = getH2HFixtures({teamOneId: currentFixture.teams.home.id, teamTwoId: currentFixture.teams.away.id, allFixtures})
        if(lastFiveHomeTeamHomeFixtures.length>=3){
            return ((homeTeamWinsMostMatches({fixtures: lastFiveHomeTeamHomeFixtures, homeTeamId: currentFixture.teams.home.id}) && (otherHomeTeamGoalsInAwayFixtures({awayTeamFixtures: lastFiveAwayTeamAwayFixtures, goals: 1}))) &&
            ( (awayTeamFailWinningInMostAwayFixtures({awayFixtures: lastFiveAwayTeamAwayFixtures})) )) ||
             (awayTeamFailScroringInMostAwayFixtures({awayfixtures: lastFiveAwayTeamAwayFixtures}) && HomeTeamScroreInMostHomeFixtures({homefixtures: lastFiveHomeTeamHomeFixtures, minGoals: 1}))
        }
        return false
    })
    return {fixtures: predictedFixtures, option: betOptions.find(option=> option.id===1) }//TODO can look into making that betoption id a enum
}

export const predictAwayWin =({currentFixtures, allFixtures}:{currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=>{
    const predictedFixtures= currentFixtures.filter(currentFixture=>{
        const lastFiveHomeTeamHomeFixtures =  getLastFiveTeamHomeFixtures({teamId: currentFixture.teams.home.id, allFixtures});
        const lastFiveAwayTeamAwayFixtures =  getLastFiveTeamAwayFixtures({teamId: currentFixture.teams.away.id, allFixtures});
        const fixtureH2hFixtures = getH2HFixtures({teamOneId: currentFixture.teams.home.id, teamTwoId: currentFixture.teams.away.id, allFixtures})
       
        
        if(lastFiveAwayTeamAwayFixtures.length< 3 || fixtureH2hFixtures.length < 2){
            return false
        }
        //TODO filter the fixtures that passes the H wins either half test here and return it
        return ((awayTeamWinsMostMatchesTimes({fixtures: lastFiveAwayTeamAwayFixtures, awayTeamId: currentFixture.teams.away.id}) && (otherAwayTeamGoalsInHomeFixtures({homeTeamFixtures: lastFiveHomeTeamHomeFixtures, goals: 1}))) &&
        ((homeTeamFailWinningInMostHomeFixtures({homefixtures:lastFiveHomeTeamHomeFixtures})) ) )||
         (homeTeamFailScroringInMostHomeFixtures({homefixtures: lastFiveHomeTeamHomeFixtures}) && awayTeamScroreInMostAwayFixtures({awayfixtures: lastFiveAwayTeamAwayFixtures, minGoals: 1}))
    })
    return {fixtures: predictedFixtures, option: betOptions.find(option=> option.id===12) }//TODO can look into making that betoption id a enum
}

export const predictHomeOver1_5 =({currentFixtures, allFixtures}:{currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=>{
    const predictedFixtures= currentFixtures.filter(currentFixture=>{
        const lastFiveHomeTeamHomeFixtures =  getLastFiveTeamHomeFixtures({teamId: currentFixture.teams.home.id, allFixtures});
        const lastFiveAwayTeamAwayFixtures =  getLastFiveTeamAwayFixtures({teamId: currentFixture.teams.away.id, allFixtures});
        const fixtureH2hFixtures = getH2HFixtures({teamOneId: currentFixture.teams.home.id, teamTwoId: currentFixture.teams.away.id, allFixtures})
        if(lastFiveHomeTeamHomeFixtures.length <3 ){
            return false
        }
       return (HomeTeamScroreInMostHomeFixtures({homefixtures: lastFiveHomeTeamHomeFixtures, minGoals: 2}))
       && (otherHomeTeamGoalsInAwayFixtures({awayTeamFixtures: lastFiveAwayTeamAwayFixtures, goals: 1}))
    })
    return {fixtures: predictedFixtures, option: betOptions.find(option=> option.id===2) }//TODO can look into making that betoption id a enum
}
export const predictMultiGoals2_5 =({currentFixtures, allFixtures}:{currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=>{
    const predictedFixtures= currentFixtures.filter(currentFixture=>{
        const lastFiveHomeTeamHomeFixtures =  getLastFiveTeamHomeFixtures({teamId: currentFixture.teams.home.id, allFixtures});
        const lastFiveAwayTeamAwayFixtures =  getLastFiveTeamAwayFixtures({teamId: currentFixture.teams.away.id, allFixtures});
        const fixtureH2hFixtures = getH2HFixtures({teamOneId: currentFixture.teams.home.id, teamTwoId: currentFixture.teams.away.id, allFixtures})
        if(lastFiveHomeTeamHomeFixtures.length <3 || lastFiveAwayTeamAwayFixtures.length<3 || fixtureH2hFixtures.length<3){
            return false
        }
       return fixtureH2hFixtures.every(fixtureData=> (fixtureData.goals.home + fixtureData.goals.away)>=2 && (fixtureData.goals.home + fixtureData.goals.away<=5) ) 
    })
    return {fixtures: predictedFixtures, option: betOptions.find(option=> option.id===6) }// can look into making that betoption a enum
}

export const predictMultiGoals3_6 =({currentFixtures, allFixtures}:{currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=>{
    const predictedFixtures= currentFixtures.filter(currentFixture=>{
        const lastFiveHomeTeamHomeFixtures =  getLastFiveTeamHomeFixtures({teamId: currentFixture.teams.home.id, allFixtures});
        const lastFiveAwayTeamAwayFixtures =  getLastFiveTeamAwayFixtures({teamId: currentFixture.teams.away.id, allFixtures});
        const fixtureH2hFixtures = getH2HFixtures({teamOneId: currentFixture.teams.home.id, teamTwoId: currentFixture.teams.away.id, allFixtures})
        if(lastFiveHomeTeamHomeFixtures.length <3 || lastFiveAwayTeamAwayFixtures.length<3 || fixtureH2hFixtures.length<3 ){
            return false
        }
       return fixtureH2hFixtures.every(fixtureData=> (fixtureData.goals.home + fixtureData.goals.away)>=3 && (fixtureData.goals.home + fixtureData.goals.away<=6) ) 
    })
    return {fixtures: predictedFixtures, option: betOptions.find(option=> option.id===7) }// can look into making that betoption a enum
}

export const predictBothHalVOver0_5 =({currentFixtures, allFixtures}:{currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=>{
    const predictedFixtures= currentFixtures.filter(currentFixture=>{
        const lastFiveHomeTeamHomeFixtures =  getLastFiveTeamHomeFixtures({teamId: currentFixture.teams.home.id, allFixtures});
        const lastFiveAwayTeamAwayFixtures =  getLastFiveTeamAwayFixtures({teamId: currentFixture.teams.away.id, allFixtures});
        const fixtureH2hFixtures = getH2HFixtures({teamOneId: currentFixture.teams.home.id, teamTwoId: currentFixture.teams.away.id, allFixtures})
        
        if(lastFiveHomeTeamHomeFixtures.length <3 || lastFiveAwayTeamAwayFixtures.length<3){
            return false
        }
       return (HomeTeamScroreInMostHomeFixtures({homefixtures: lastFiveHomeTeamHomeFixtures, minGoals: 2}) && awayTeamScroreInMostAwayFixtures({awayfixtures: lastFiveAwayTeamAwayFixtures, minGoals: 1}) &&
      (homeTeamScoresInMostHT({fixtures: lastFiveHomeTeamHomeFixtures, minGoals: 1, homeTeamId: currentFixture.teams.home.id}) && awayTeamScoresInMostHT({fixtures: lastFiveAwayTeamAwayFixtures, minGoals: 1, awayTeamId: currentFixture.teams.away.id})))  ||
      fixtureH2hFixtures.every(fixtureData=> (fixtureData.goals.home + fixtureData.goals.away)>=3 && (fixtureData.goals.home + fixtureData.goals.away<=6) ) 
    })
    return {fixtures: predictedFixtures, option: betOptions.find(option=> option.id===8) }// can look into making that betoption a enum
}

export const predictDrawOrGoal =({currentFixtures, allFixtures}:{currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=>{
    const predictedFixtures= currentFixtures.filter(currentFixture=>{
        const lastFiveHomeTeamHomeFixtures =  getLastFiveTeamHomeFixtures({teamId: currentFixture.teams.home.id, allFixtures});
        const lastFiveAwayTeamAwayFixtures =  getLastFiveTeamAwayFixtures({teamId: currentFixture.teams.away.id, allFixtures});
        const fixtureH2hFixtures = getH2HFixtures({teamOneId: currentFixture.teams.home.id, teamTwoId: currentFixture.teams.away.id, allFixtures})
    
        if(lastFiveHomeTeamHomeFixtures.length <3 || lastFiveAwayTeamAwayFixtures.length < 3 ){
            return false
        }
       return (((awayTeamScroreInMostAwayFixtures({awayfixtures: lastFiveAwayTeamAwayFixtures, minGoals: 1}))
       && (otherAwayTeamGoalsInHomeFixtures({homeTeamFixtures: lastFiveHomeTeamHomeFixtures, goals: 1}))) &&
       ((HomeTeamScroreInMostHomeFixtures({homefixtures: lastFiveHomeTeamHomeFixtures, minGoals: 1}))
       && (otherHomeTeamGoalsInAwayFixtures({awayTeamFixtures: lastFiveAwayTeamAwayFixtures, goals: 1})))) ||
       (homeTeamDrawMostFixtures({fixtures: lastFiveHomeTeamHomeFixtures, homeTeamId: currentFixture.teams.home.id}) && awayTeamDrawMostFixtures({fixtures: lastFiveAwayTeamAwayFixtures, awayTeamId: currentFixture.teams.away.id})) ||
       (homeTeamScroreInMostH2HFixtures({h2hFixtures: fixtureH2hFixtures,homeTeamId: currentFixture.teams.home.id, minGoals: 1}) && awayTeamScroreInMostH2HFixtures({h2hFixtures: fixtureH2hFixtures,awayTeamId: currentFixture.teams.away.id, minGoals: 1}) && fixtureH2hFixtures.length>=3)
    })
    return {fixtures: predictedFixtures, option: betOptions.find(option=> option.id===9) }// can look into making that betoption a enum
}

export const predictDraw =({currentFixtures, allFixtures}:{currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=>{
    const predictedFixtures= currentFixtures.filter(currentFixture=>{
        const lastFiveHomeTeamHomeFixtures =  getLastFiveTeamHomeFixtures({teamId: currentFixture.teams.home.id, allFixtures});
        const lastFiveAwayTeamAwayFixtures =  getLastFiveTeamAwayFixtures({teamId: currentFixture.teams.away.id, allFixtures});
        const fixtureH2hFixtures = getH2HFixtures({teamOneId: currentFixture.teams.home.id, teamTwoId: currentFixture.teams.away.id, allFixtures})
       
        if(fixtureH2hFixtures.length < 2){
            return false
        }
       return (homeTeamDrawMostFixtures({fixtures: fixtureH2hFixtures, homeTeamId: currentFixture.teams.home.id}) && awayTeamDrawMostFixtures({fixtures: fixtureH2hFixtures, awayTeamId: currentFixture.teams.away.id})) ||
       (homeTeamFailScroringInMostHomeFixtures({homefixtures: lastFiveHomeTeamHomeFixtures}) && awayTeamFailScroringInMostAwayFixtures({awayfixtures: lastFiveAwayTeamAwayFixtures}))
    })
    return {fixtures: predictedFixtures, option: betOptions.find(option=> option.id===10) }// can look into making that betoption a enum
}

export const predictHTDraw =({currentFixtures, allFixtures}:{currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=>{
    const predictedFixtures= currentFixtures.filter(currentFixture=>{
        const lastFiveHomeTeamHomeFixtures =  getLastFiveTeamHomeFixtures({teamId: currentFixture.teams.home.id, allFixtures});
        const lastFiveAwayTeamAwayFixtures =  getLastFiveTeamAwayFixtures({teamId: currentFixture.teams.away.id, allFixtures});
        const fixtureH2hFixtures = getH2HFixtures({teamOneId: currentFixture.teams.home.id, teamTwoId: currentFixture.teams.away.id, allFixtures})
        if(fixtureH2hFixtures.length < 2){
            return false
        }
       return (homeTeamFailScroringInMostHomeFixtures({homefixtures: lastFiveHomeTeamHomeFixtures}) && awayTeamFailScroringInMostAwayFixtures({awayfixtures: lastFiveAwayTeamAwayFixtures})) &&
       fixtureH2hFixtures.every(fixture=> fixture.score.halftime.home + fixture.score.halftime.away ===0)
    })
    return {fixtures: predictedFixtures, option: betOptions.find(option=> option.id===11) }// can look into making that betoption a enum
}

export const predictAwayOver1_5 =({currentFixtures, allFixtures}:{currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=>{
    const predictedFixtures= currentFixtures.filter(currentFixture=>{
        const lastFiveHomeTeamHomeFixtures =  getLastFiveTeamHomeFixtures({teamId: currentFixture.teams.home.id, allFixtures});
        const lastFiveAwayTeamAwayFixtures =  getLastFiveTeamAwayFixtures({teamId: currentFixture.teams.away.id, allFixtures});
        if(lastFiveAwayTeamAwayFixtures.length <3 ){
            return false
        }
        return (awayTeamScroreInMostAwayFixtures({awayfixtures: lastFiveAwayTeamAwayFixtures, minGoals: 2}))
        && (otherAwayTeamGoalsInHomeFixtures({homeTeamFixtures: lastFiveHomeTeamHomeFixtures, goals: 1}))
    })
    return {fixtures: predictedFixtures, option: betOptions.find(option=> option.id===13) }// can loo                           k into making that betoption a enum
}

export const predictHomeOver0_5 =({currentFixtures, allFixtures}:{currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=>{
    const predictedFixtures= currentFixtures.filter(currentFixture=>{
        const lastFiveHomeTeamHomeFixtures =  getLastFiveTeamHomeFixtures({teamId: currentFixture.teams.home.id, allFixtures});
        const lastFiveAwayTeamAwayFixtures =  getLastFiveTeamAwayFixtures({teamId: currentFixture.teams.away.id, allFixtures});
        const fixtureH2hFixtures = getH2HFixtures({teamOneId: currentFixture.teams.home.id, teamTwoId: currentFixture.teams.away.id, allFixtures})
        if(lastFiveHomeTeamHomeFixtures.length <3){
            return false
        }
       return (HomeTeamScroreInMostHomeFixtures({homefixtures: lastFiveHomeTeamHomeFixtures, minGoals: 1}))
       && (otherHomeTeamGoalsInAwayFixtures({awayTeamFixtures: lastFiveAwayTeamAwayFixtures, goals: 1}))
    })
    return {fixtures: predictedFixtures, option: betOptions.find(option=> option.id===15) }// can look into making that betoption a enum
}

export const predictAwayOver0_5 =({currentFixtures, allFixtures}:{currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=>{
    const predictedFixtures= currentFixtures.filter(currentFixture=>{
        const lastFiveHomeTeamHomeFixtures =  getLastFiveTeamHomeFixtures({teamId: currentFixture.teams.home.id, allFixtures});
        const lastFiveAwayTeamAwayFixtures =  getLastFiveTeamAwayFixtures({teamId: currentFixture.teams.away.id, allFixtures});
        const fixtureH2hFixtures = getH2HFixtures({teamOneId: currentFixture.teams.home.id, teamTwoId: currentFixture.teams.away.id, allFixtures})
        if(lastFiveAwayTeamAwayFixtures.length <3 ){
            return false
        }
       return (awayTeamScroreInMostAwayFixtures({awayfixtures: lastFiveAwayTeamAwayFixtures, minGoals: 1}))
       && (otherAwayTeamGoalsInHomeFixtures({homeTeamFixtures: lastFiveHomeTeamHomeFixtures, goals: 1}))
    })
    return {fixtures: predictedFixtures, option: betOptions.find(option=> option.id===16) }// can look into making that betoption a enum
}

// --- new Prediction functions

export const predictMultiGoals2_4 =({currentFixtures, allFixtures}:{currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=>{
    const predictedFixtures= currentFixtures.filter(currentFixture=>{
        const lastFiveHomeTeamHomeFixtures =  getLastFiveTeamHomeFixtures({teamId: currentFixture.teams.home.id, allFixtures});
        const lastFiveAwayTeamAwayFixtures =  getLastFiveTeamAwayFixtures({teamId: currentFixture.teams.away.id, allFixtures});
        const fixtureH2hFixtures = getH2HFixtures({teamOneId: currentFixture.teams.home.id, teamTwoId: currentFixture.teams.away.id, allFixtures})
        if(lastFiveAwayTeamAwayFixtures.length <3 || lastFiveHomeTeamHomeFixtures.length<3){
            return false
        }
       return ((lastFiveHomeTeamHomeFixtures.every(fixtureData=> fixtureData.goals.home > 0 && fixtureData.goals.home<3 ) && lastFiveAwayTeamAwayFixtures.every(fixtureData=> fixtureData.goals.away > 0 && fixtureData.goals.away<3))
       )
    })
    return {fixtures: predictedFixtures, option: betOptions.find(option=> option.id===17) }// can look into making that betoption a enum
}

export const predictMultiGoals0_2 =({currentFixtures, allFixtures}:{currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=>{
    const predictedFixtures= currentFixtures.filter(currentFixture=>{
        const lastFiveHomeTeamHomeFixtures =  getLastFiveTeamHomeFixtures({teamId: currentFixture.teams.home.id, allFixtures});
        const lastFiveAwayTeamAwayFixtures =  getLastFiveTeamAwayFixtures({teamId: currentFixture.teams.away.id, allFixtures});
        const fixtureH2hFixtures = getH2HFixtures({teamOneId: currentFixture.teams.home.id, teamTwoId: currentFixture.teams.away.id, allFixtures})
        if(lastFiveAwayTeamAwayFixtures.length <3 || lastFiveHomeTeamHomeFixtures.length<3){
            return false
        }
       return ((lastFiveHomeTeamHomeFixtures.every(fixtureData=> fixtureData.goals.home <=1) && lastFiveAwayTeamAwayFixtures.every(fixtureData=> fixtureData.goals.away <=1)))
    })
    return {fixtures: predictedFixtures, option: betOptions.find(option=> option.id===18) }// can look into making that betoption a enum
}

export const predictMultiGoals0_3 =({currentFixtures, allFixtures}:{currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=>{
    const predictedFixtures= currentFixtures.filter(currentFixture=>{
        const lastFiveHomeTeamHomeFixtures =  getLastFiveTeamHomeFixtures({teamId: currentFixture.teams.home.id, allFixtures});
        const lastFiveAwayTeamAwayFixtures =  getLastFiveTeamAwayFixtures({teamId: currentFixture.teams.away.id, allFixtures});
        const fixtureH2hFixtures = getH2HFixtures({teamOneId: currentFixture.teams.home.id, teamTwoId: currentFixture.teams.away.id, allFixtures})
        if(lastFiveAwayTeamAwayFixtures.length <3 || lastFiveHomeTeamHomeFixtures.length<3){
            return false
        }
        return ((lastFiveHomeTeamHomeFixtures.every(fixtureData=> fixtureData.goals.home <=1) && lastFiveAwayTeamAwayFixtures.every(fixtureData=> fixtureData.goals.away <=1)))
    })
    return {fixtures: predictedFixtures, option: betOptions.find(option=> option.id===19) }// can look into making that betoption a enum
}

export const predictMultiGoals1_2Home =({currentFixtures, allFixtures}:{currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=>{
    const predictedFixtures= currentFixtures.filter(currentFixture=>{
        const lastFiveAwayTeamAwayFixtures =  getLastFiveTeamAwayFixtures({teamId: currentFixture.teams.away.id, allFixtures});
        const lastFiveHomeTeamHomeFixtures =  getLastFiveTeamHomeFixtures({teamId: currentFixture.teams.home.id, allFixtures});
        const fixtureH2hFixtures = getH2HFixtures({teamOneId: currentFixture.teams.home.id, teamTwoId: currentFixture.teams.away.id, allFixtures})
        if(lastFiveHomeTeamHomeFixtures.length <3){
            return false
        }
       return (lastFiveHomeTeamHomeFixtures.every(fixtureData=> (fixtureData.goals.home >=1 && fixtureData.goals.home <=2 ))) && otherHomeTeamGoalsInAwayFixtures({awayTeamFixtures: lastFiveAwayTeamAwayFixtures, goals:1}) ||
       ((HomeTeamScroreInMostHomeFixtures({homefixtures: lastFiveHomeTeamHomeFixtures, minGoals: 1}))
       && otherHomeTeamMinMaxGoalsInAwayFixtures({awayTeamFixtures: lastFiveAwayTeamAwayFixtures, minGoals: 1, maxGoals: 2}))
    })
    return {fixtures: predictedFixtures, option: betOptions.find(option=> option.id===20) }// can look into making that betoption a enum
}

export const predictMultiGoals1_3Home =({currentFixtures, allFixtures}:{currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=>{
    const predictedFixtures= currentFixtures.filter(currentFixture=>{
        const lastFiveAwayTeamAwayFixtures =  getLastFiveTeamAwayFixtures({teamId: currentFixture.teams.away.id, allFixtures});
        const lastFiveHomeTeamHomeFixtures =  getLastFiveTeamHomeFixtures({teamId: currentFixture.teams.home.id, allFixtures});
        const fixtureH2hFixtures = getH2HFixtures({teamOneId: currentFixture.teams.home.id, teamTwoId: currentFixture.teams.away.id, allFixtures})
        if(lastFiveHomeTeamHomeFixtures.length <3 ){
            return false
        }
        return (lastFiveHomeTeamHomeFixtures.every(fixtureData=> (fixtureData.goals.home >=1 && fixtureData.goals.home <=3 ))) && otherHomeTeamGoalsInAwayFixtures({awayTeamFixtures: lastFiveAwayTeamAwayFixtures, goals:1})
    })
    return {fixtures: predictedFixtures, option: betOptions.find(option=> option.id===21) }// can look into making that betoption a enum
}

export const predictMultiGoals2_3Home =({currentFixtures, allFixtures}:{currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=>{
    const predictedFixtures= currentFixtures.filter(currentFixture=>{
        const lastFiveAwayTeamAwayFixtures =  getLastFiveTeamAwayFixtures({teamId: currentFixture.teams.away.id, allFixtures});
        const lastFiveHomeTeamHomeFixtures =  getLastFiveTeamHomeFixtures({teamId: currentFixture.teams.home.id, allFixtures});
        const fixtureH2hFixtures = getH2HFixtures({teamOneId: currentFixture.teams.home.id, teamTwoId: currentFixture.teams.away.id, allFixtures})
        if(lastFiveHomeTeamHomeFixtures.length <3){
            return false
        }
        return (lastFiveHomeTeamHomeFixtures.every(fixtureData=> (fixtureData.goals.home >=2 && fixtureData.goals.home <=3 ))) && otherHomeTeamGoalsInAwayFixtures({awayTeamFixtures: lastFiveAwayTeamAwayFixtures, goals:1}) ||
        ((HomeTeamScroreInMostHomeFixtures({homefixtures: lastFiveHomeTeamHomeFixtures, minGoals: 2}))
         && otherHomeTeamMinMaxGoalsInAwayFixtures({awayTeamFixtures: lastFiveAwayTeamAwayFixtures, minGoals: 2, maxGoals: 3}))
    })
    return {fixtures: predictedFixtures, option: betOptions.find(option=> option.id===22) }// can look into making that betoption a enum
}

export const predictMultiGoals1_2Away =({currentFixtures, allFixtures}:{currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=>{
    const predictedFixtures= currentFixtures.filter(currentFixture=>{
        const lastFiveHomeTeamHomeFixtures =  getLastFiveTeamHomeFixtures({teamId: currentFixture.teams.home.id, allFixtures});
        const lastFiveAwayTeamAwayFixtures =  getLastFiveTeamAwayFixtures({teamId: currentFixture.teams.away.id, allFixtures});
        const fixtureH2hFixtures = getH2HFixtures({teamOneId: currentFixture.teams.home.id, teamTwoId: currentFixture.teams.away.id, allFixtures})
        if(lastFiveAwayTeamAwayFixtures.length <3 ){
            return false
        }
        return (lastFiveAwayTeamAwayFixtures.every(fixtureData=> (fixtureData.goals.away >=1 && fixtureData.goals.away <=2 ))) && otherAwayTeamGoalsInHomeFixtures({homeTeamFixtures: lastFiveHomeTeamHomeFixtures, goals:1}) ||
        ((awayTeamScroreInMostAwayFixtures({awayfixtures: lastFiveAwayTeamAwayFixtures, minGoals: 2}))
       && otherAwayTeamMinMaxGoalsInHomeFixtures({homeTeamFixtures: lastFiveHomeTeamHomeFixtures, minGoals: 1, maxGoals: 2}))
    })
    return {fixtures: predictedFixtures, option: betOptions.find(option=> option.id===23) }// can look into making that betoption a enum
}


export const predictMultiGoals2_3Away =({currentFixtures, allFixtures}:{currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=>{
    
    const predictedFixtures= currentFixtures.filter(currentFixture=>{
        const lastFiveHomeTeamHomeFixtures =  getLastFiveTeamHomeFixtures({teamId: currentFixture.teams.home.id, allFixtures});
        const lastFiveAwayTeamAwayFixtures =  getLastFiveTeamAwayFixtures({teamId: currentFixture.teams.away.id, allFixtures});
        const fixtureH2hFixtures = getH2HFixtures({teamOneId: currentFixture.teams.home.id, teamTwoId: currentFixture.teams.away.id, allFixtures})
        if(lastFiveAwayTeamAwayFixtures.length <3 ){
            return false
        }
        return (lastFiveAwayTeamAwayFixtures.every(fixtureData=> (fixtureData.goals.away >=2 && fixtureData.goals.away <=3 ))) && otherAwayTeamGoalsInHomeFixtures({homeTeamFixtures: lastFiveHomeTeamHomeFixtures, goals:1}) ||
        ((awayTeamScroreInMostAwayFixtures({awayfixtures: lastFiveAwayTeamAwayFixtures, minGoals: 2}))
        && otherAwayTeamMinMaxGoalsInHomeFixtures({homeTeamFixtures: lastFiveHomeTeamHomeFixtures, minGoals: 2, maxGoals: 3}))
    })
    return {fixtures: predictedFixtures, option: betOptions.find(option=> option.id===24) }// can look into making that betoption a enum
}

export const predictMultiGoals1_3Away =({currentFixtures, allFixtures}:{currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=>{
    const predictedFixtures= currentFixtures.filter(currentFixture=>{
        const lastFiveHomeTeamHomeFixtures =  getLastFiveTeamHomeFixtures({teamId: currentFixture.teams.home.id, allFixtures});
        const lastFiveAwayTeamAwayFixtures =  getLastFiveTeamAwayFixtures({teamId: currentFixture.teams.away.id, allFixtures});
        const fixtureH2hFixtures = getH2HFixtures({teamOneId: currentFixture.teams.home.id, teamTwoId: currentFixture.teams.away.id, allFixtures})
        if(lastFiveAwayTeamAwayFixtures.length <3){
            return false
        }
        return (lastFiveAwayTeamAwayFixtures.every(fixtureData=> (fixtureData.goals.away >=1 && fixtureData.goals.away <=3 ))) && otherAwayTeamGoalsInHomeFixtures({homeTeamFixtures: lastFiveHomeTeamHomeFixtures, goals:1})
    })
    return {fixtures: predictedFixtures, option: betOptions.find(option=> option.id===25) }// can look into making that betoption a enum
}

export const getLastFiveTeamHomeFixtures = ({teamId, allFixtures}: {teamId: number, allFixtures: FixtureDataModel[]})=>{
    return allFixtures.filter(fixture=>{
      return (fixture.teams.home.id === teamId) && fixture.fixture.status.short ==='FT'
    }).slice(0, numberOTeamLastFixturesBack).sort((fixtureA, fixtureB)=> {
        return fixtureB.fixture.timestamp - fixtureA.fixture.timestamp
    })
  }

  export const getLastFiveTeamAwayFixtures = ({teamId, allFixtures}: {teamId: number, allFixtures: FixtureDataModel[]})=>{
    return allFixtures.filter(fixture=>{
      return (fixture.teams.away.id === teamId || fixture.teams.away.id === teamId) && fixture.fixture.status.short ==='FT'
    }).slice(0, numberOTeamLastFixturesBack).sort((fixtureA, fixtureB)=> {
        return fixtureB.fixture.timestamp - fixtureA.fixture.timestamp
    })
  }
  
  export const getH2HFixtures =({teamOneId, teamTwoId, allFixtures}: {teamOneId: number, teamTwoId: number, allFixtures: FixtureDataModel[] })=>{
      return allFixtures.filter(fixture=>{
          return ((fixture.teams.home.id === teamOneId || fixture.teams.away.id === teamOneId) &&
          (fixture.teams.home.id === teamTwoId || fixture.teams.away.id === teamTwoId)) && fixture.fixture.status.short ==='FT'
      }).slice(0, numberOfH2HMatchesBack).sort((fixtureA, fixtureB)=> {
        return fixtureB.fixture.timestamp - fixtureA.fixture.timestamp
    }) //TODO verify there's enough h2h
  }


  export const HomeTeamScroreInMostHomeFixtures =({homefixtures, minGoals}: {homefixtures: FixtureDataModel[], minGoals: number })=>{
      let conditionPassedCount =0;
      homefixtures.forEach(fixtureData=> {
        if(fixtureData.goals.home>=minGoals){
            conditionPassedCount+=1;

        }
    })
    if(((conditionPassedCount/homefixtures.length))>=0.9){
        return true;
    }else{
        return false
    }
 }

 export const awayTeamScroreInMostAwayFixtures =({awayfixtures, minGoals}: {awayfixtures: FixtureDataModel[]; minGoals: number})=>{
    let conditionPassedCount =0;
    awayfixtures.forEach(fixtureData=> {
      if(fixtureData.goals.away>=minGoals){
          conditionPassedCount+=1;
      }
  })
  if(((conditionPassedCount/awayfixtures.length))>=0.7){
      return true;
  }else{
      return false
  }
}


export const awayTeamFailScroringInMostAwayFixtures =({awayfixtures}: {awayfixtures: FixtureDataModel[]})=>{
    let conditionPassedCount =0;
    awayfixtures.forEach(fixtureData=> {
      if(fixtureData.goals.away < 1){
          conditionPassedCount+=1;
      }
  })
  if(((conditionPassedCount/awayfixtures.length))>=0.6){
      return true;
  }else{
      return false
  }
}

export const homeTeamFailScroringInMostHomeFixtures =({homefixtures}: {homefixtures: FixtureDataModel[]})=>{
    let conditionPassedCount =0;
    homefixtures.forEach(fixtureData=> {
      if(fixtureData.goals.home< 1){
          conditionPassedCount+=1;
      }
  })
  if(((conditionPassedCount/homefixtures.length))>=0.6){
      return true;
  }else{
      return false
  }
}

export const homeTeamFailWinningInMostHomeFixtures =({homefixtures}: {homefixtures: FixtureDataModel[]})=>{
    let conditionPassedCount =0;
    homefixtures.forEach(fixtureData=> {
      if(fixtureData.goals.home<= fixtureData.goals.away){
          conditionPassedCount+=1;
      }
  })
  if(((conditionPassedCount/homefixtures.length))>=0.6){
      return true;
  }else{
      return false
  }
}

export const awayTeamFailWinningInMostAwayFixtures =({awayFixtures}: {awayFixtures: FixtureDataModel[]})=>{
    let conditionPassedCount =0;
    awayFixtures.forEach(fixtureData=> {
      if(fixtureData.goals.away <= fixtureData.goals.home){
          conditionPassedCount+=1;
      }
  })
  if(((conditionPassedCount/awayFixtures.length))>=0.6){
      return true;
  }else{
      return false
  }
}


export const awayTeamScroreInMostH2HFixtures =({h2hFixtures, minGoals, awayTeamId}: {h2hFixtures: FixtureDataModel[]; minGoals: number, awayTeamId: number })=>{
    let conditionPassedCount =0;
    h2hFixtures.forEach(fixtureData=> {
        if(((fixtureData.goals.home>= minGoals) && fixtureData.teams.home.id ===awayTeamId) || ((fixtureData.goals.away>= minGoals) && fixtureData.teams.away.id ===awayTeamId) ){
            conditionPassedCount+=1;
        }
  })
  if(((conditionPassedCount/h2hFixtures.length))>= 0.9){
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
  if(((conditionPassedCount/h2hFixtures.length))>=0.9){
      return true;
  }else{
      return false
  }
}

const otherHomeTeamGoalsInAwayFixtures = ({awayTeamFixtures, goals}: {awayTeamFixtures: FixtureDataModel[]; goals: number})=>{
    let conditionPassedCount =0;
    awayTeamFixtures.forEach(fixtureData=>{
        if(fixtureData.goals.home>= goals){
            conditionPassedCount+=1;
        }
    })
    if(((conditionPassedCount/awayTeamFixtures.length))>=0.6){
        return true;
    }else{
        return false
    }
}

const otherAwayTeamGoalsInHomeFixtures = ({homeTeamFixtures, goals}: {homeTeamFixtures: FixtureDataModel[]; goals: number})=>{
    let conditionPassedCount =0;
    homeTeamFixtures.forEach(fixtureData=>{
        if(fixtureData.goals.away>= goals){
            conditionPassedCount+=1;
        }
    })
    if(((conditionPassedCount/homeTeamFixtures.length))>=0.6){
        return true;
    }else{
        return false
    }
}

const otherHomeTeamMinMaxGoalsInAwayFixtures = ({awayTeamFixtures, minGoals, maxGoals}: {awayTeamFixtures: FixtureDataModel[]; minGoals: number; maxGoals: number})=>{
    let conditionPassedCount =0;
    awayTeamFixtures.forEach(fixtureData=>{
        if(fixtureData.goals.home>= minGoals && fixtureData.goals.home<=maxGoals){
            conditionPassedCount+=1;
        }
    })
    if(((conditionPassedCount/awayTeamFixtures.length))>0.6){
        return true;
    }else{
        return false
    }
}

const otherAwayTeamMinMaxGoalsInHomeFixtures = ({homeTeamFixtures,  minGoals, maxGoals}: {homeTeamFixtures: FixtureDataModel[]; minGoals: number; maxGoals: number})=>{
    let conditionPassedCount =0;
    homeTeamFixtures.forEach(fixtureData=>{
        if(fixtureData.goals.away>= minGoals &&  fixtureData.goals.away<=maxGoals){
            conditionPassedCount+=1;
        }
    })
    if(((conditionPassedCount/homeTeamFixtures.length))>0.6){
        return true;
    }else{
        return false
    }
}

const homeTeamWinsMostHalfTimes = ({fixtures, homeTeamId}: {fixtures: FixtureDataModel[], homeTeamId: number})=>{
    let conditionPassedCount =0;
    fixtures.forEach(fixtureData=>{
        if(((fixtureData.score.halftime.home> fixtureData.score.halftime.away) && fixtureData.teams.home.id === homeTeamId)||
        ((fixtureData.score.halftime.away> fixtureData.score.halftime.home) && fixtureData.teams.away.id === homeTeamId)){
            conditionPassedCount+=1;
        }
    })
    if(((conditionPassedCount/fixtures.length))>0.75){
        return true;
    }else{
        return false
    }
}

const homeTeamWinsMostMatches = ({fixtures, homeTeamId}: {fixtures: FixtureDataModel[], homeTeamId: number})=>{
    let conditionPassedCount =0;
    fixtures.forEach(fixtureData=>{
        if(((fixtureData.score.fulltime.home> fixtureData.score.fulltime.away) && fixtureData.teams.home.id === homeTeamId)||
        ((fixtureData.score.fulltime.away> fixtureData.score.fulltime.home) && fixtureData.teams.away.id === homeTeamId)){
            conditionPassedCount+=1;
        }
    })
    if(((conditionPassedCount/fixtures.length))>0.75){
        return true;
    }else{
        return false
    }
}

const awayTeamWinsMostHalfTimes = ({fixtures, awayTeamId}: {fixtures: FixtureDataModel[], awayTeamId: number})=>{
    let conditionPassedCount =0;
    fixtures.forEach(fixtureData=>{
        if(((fixtureData.score.halftime.home> fixtureData.score.halftime.away) && fixtureData.teams.home.id === awayTeamId)||
        ((fixtureData.score.halftime.away> fixtureData.score.halftime.home) && fixtureData.teams.away.id === awayTeamId)){
            conditionPassedCount+=1;
        }
    })
    if(((conditionPassedCount/fixtures.length))>0.75){
        return true;
    }else{
        return false
    }
}

const awayTeamWinsMostMatchesTimes = ({fixtures, awayTeamId}: {fixtures: FixtureDataModel[], awayTeamId: number})=>{
    let conditionPassedCount =0;
    fixtures.forEach(fixtureData=>{
        if(((fixtureData.score.fulltime.home> fixtureData.score.fulltime.away) && fixtureData.teams.home.id === awayTeamId)||
        ((fixtureData.score.fulltime.away> fixtureData.score.fulltime.home) && fixtureData.teams.away.id === awayTeamId)){
            conditionPassedCount+=1;
        }
    })
    if(((conditionPassedCount/fixtures.length))>0.75){
        return true;
    }else{
        return false
    }
}

const homeTeamScoresInMostHT = ({fixtures, minGoals, homeTeamId}: {fixtures: FixtureDataModel[], minGoals: number, homeTeamId: number})=>{
    let conditionPassedCount =0;
    fixtures.forEach(fixtureData=>{
        if(((fixtureData.score.halftime.home>= minGoals) && fixtureData.teams.home.id === homeTeamId) || ((fixtureData.score.halftime.away>= minGoals) && fixtureData.teams.away.id === homeTeamId)){
            conditionPassedCount+=1;
        }
    })
    if(((conditionPassedCount/fixtures.length))>0.9){
        return true;
    }else{
        return false
    }
}

const awayTeamScoresInMostHT = ({fixtures, minGoals, awayTeamId}: {fixtures: FixtureDataModel[], minGoals: number, awayTeamId: number})=>{
    let conditionPassedCount =0;
    fixtures.forEach(fixtureData=>{
        if(((fixtureData.score.halftime.away>= minGoals) && fixtureData.teams.away.id === awayTeamId) || ((fixtureData.score.halftime.home>= minGoals) && fixtureData.teams.home.id === awayTeamId)){
            conditionPassedCount+=1;
        }
    })
    if(((conditionPassedCount/fixtures.length))>0.9){
        return true;
    }else{
        return false
    }
}

const homeTeamDrawMostFixtures = ({fixtures, homeTeamId}: {fixtures: FixtureDataModel[], homeTeamId: number})=>{
    let conditionPassedCount =0;
    fixtures.forEach(fixtureData=>{
        if(((fixtureData.teams.home.winner === null) && fixtureData.teams.home.id===homeTeamId) || ((fixtureData.teams.away.winner === null) && fixtureData.teams.away.id===homeTeamId)){
            conditionPassedCount+=1;
        }
    })
    if(((conditionPassedCount/fixtures.length))>0.75){
        return true;
    }else{
        return false
    }
}

const awayTeamDrawMostFixtures = ({fixtures, awayTeamId}: {fixtures: FixtureDataModel[], awayTeamId: number})=>{
    let conditionPassedCount =0;
    fixtures.forEach(fixtureData=>{
        if(((fixtureData.teams.home.winner === null) && fixtureData.teams.home.id===awayTeamId) || ((fixtureData.teams.away.winner === null) && fixtureData.teams.away.id===awayTeamId)){
            conditionPassedCount+=1;
        }
    })
    if(((conditionPassedCount/fixtures.length))>0.75){
        return true;
    }else{
        return false
    }
}

  export const filterByDate=(fixtures: FixtureDataModel[])=> fixtures.sort((fixtureA, fixtureB)=> {
      return fixtureA.fixture.timestamp - fixtureB.fixture.timestamp
  })