import { FixtureDataModel } from "../models/fixtures";
import { betOptions, numberOfH2HMatchesBack, numberOTeamLastFixturesBack } from "../variables/variables";


// TODO sort fixtures by dates. Latest first 

export const predictOver1_5 =({currentFixtures, allFixtures}:{currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=>{
    const predictedFixtures= currentFixtures.filter(currentFixture=>{
        const lastFiveHomeFixtures =  getLastFiveTeamFixtures({teamId: currentFixture.teams.home.id, allFixtures});
        const lastFiveAwayFixtures =  getLastFiveTeamFixtures({teamId: currentFixture.teams.away.id, allFixtures});
        const fixtureH2hFixtures = getH2HFixtures({teamOneId: currentFixture.teams.home.id, teamTwoId: currentFixture.teams.away.id, allFixtures})
        console.log({lastFiveHomeFixtures});
        console.log({lastFiveAwayFixtures});
        console.log({fixtureH2hFixtures});
        // filter the fixtures that passes the over 1.5 test here and return it
       return true
    })
    return {fixtures: predictedFixtures, option: betOptions.find(option=> option.id===3) }// can look into making that betoption a enum
}


export const predictBothTeamsToScore =({currentFixtures, allFixtures}:{currentFixtures: FixtureDataModel[]  ,allFixtures: FixtureDataModel[]})=>{
    const predictedFixtures= currentFixtures.filter(currentFixture=>{
        const lastFiveHomeFixtures =  getLastFiveTeamFixtures({teamId: currentFixture.teams.home.id, allFixtures});
        const lastFiveAwayFixtures =  getLastFiveTeamFixtures({teamId: currentFixture.teams.away.id, allFixtures});
        const fixtureH2hFixtures = getH2HFixtures({teamOneId: currentFixture.teams.home.id, teamTwoId: currentFixture.teams.away.id, allFixtures})
        console.log({lastFiveHomeFixtures});
        console.log({lastFiveAwayFixtures});
        console.log({fixtureH2hFixtures});
        //TODO filter the fixtures that passes the over 1.5 test here and return it
       return true
    })
    return {fixtures: predictedFixtures, option: betOptions.find(option=> option.id===0) }//TODO can look into making that betoption a enum
}

export const getLastFiveTeamFixtures = ({teamId, allFixtures}: {teamId: Number, allFixtures: FixtureDataModel[]})=>{
    return allFixtures.filter(fixture=>{
      return (fixture.teams.home.id === teamId || fixture.teams.away.id === teamId) && fixture.fixture.status.short ==='FT'
    }).slice(0, numberOTeamLastFixturesBack)
  }
  
  export const getH2HFixtures =({teamOneId, teamTwoId, allFixtures}: {teamOneId: Number, teamTwoId: Number, allFixtures: FixtureDataModel[] })=>{
      return allFixtures.filter(fixture=>{
          return ((fixture.teams.home.id === teamOneId || fixture.teams.away.id === teamOneId) &&
          (fixture.teams.home.id === teamTwoId || fixture.teams.away.id === teamTwoId)) && fixture.fixture.status.short ==='FT'
      }).slice(0, numberOfH2HMatchesBack) //TODO verify there's enough h2h
  }