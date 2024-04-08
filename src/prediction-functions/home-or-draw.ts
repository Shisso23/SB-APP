import { betOptionsEnum } from "../enums/bet-options.enums";
import { betOptionModel } from "../models/bet-option-model";
import { FixtureDataModel } from "../models/fixtures";
import { StandingsDataStandingModel, StandingsModel } from "../models/standings-models";
import { betOptions } from "../variables/variables";
import * as sharedFunctions from "./shared-functions";

export const predictHomeOrDraw = ({
    currentFixtures,
    allFixtures,
    leaguesStandings,
  }: {
    currentFixtures: FixtureDataModel[];
    allFixtures: FixtureDataModel[];
    leaguesStandings: StandingsModel[];
  }) => {
    const predictedFixtures = currentFixtures.filter(currentFixture => {
      const awayTeamStanding: StandingsDataStandingModel = sharedFunctions.getAwayTeamStanding({
        standings: leaguesStandings,
        awayTeamId: currentFixture.teams.away.id,
        leagueId: currentFixture.league.id,
      });
      const homeTeamStanding: StandingsDataStandingModel = sharedFunctions.getHomeTeamStanding({
        standings: leaguesStandings,
        homeTeamId: currentFixture.teams.home.id,
        leagueId: currentFixture.league.id,
      });
     
      const allAwayTeamAwayFixtures = sharedFunctions.getAllAwayTeamAwayFixtures({allFixtures, currentSeason: currentFixture.league.season, teamId: currentFixture.teams.away.id})
      
      const allHomeTeamHomeFixtures = sharedFunctions.getAllHomeTeamHomeFixtures({allFixtures, currentSeason: currentFixture.league.season, teamId: currentFixture.teams.home.id})
      if(allAwayTeamAwayFixtures.length <3 || allHomeTeamHomeFixtures.length<3   || !awayTeamStanding||
        !homeTeamStanding) return false
        
      const homeTeamAverageGoalsScored = sharedFunctions.averageGoalsScoredAtHome({homeTeamHomeFixtures: allHomeTeamHomeFixtures})
      const homeTeamAverageGoalsConceded = sharedFunctions.averageGoalsConcededAtHome({homeTeamHomeFixtures: allHomeTeamHomeFixtures})
      const awayTeamAverageGoalsScored = sharedFunctions.averageGoalsScoredAway({awayTeamAwayFixtures: allAwayTeamAwayFixtures})
      const awayTeamAverageGoalsConceded = sharedFunctions.averageGoalsConcededAway({awayTeamAwayFixtures: allAwayTeamAwayFixtures})

  
      return( 
        (sharedFunctions.teamMax0({teamAAverageGoalsScored:awayTeamAverageGoalsScored, teamBAverageGoalsConceded: homeTeamAverageGoalsConceded})) && (homeTeamStanding.rank < awayTeamStanding.rank) && (Math.abs(homeTeamStanding.rank - awayTeamStanding.rank)>= 3)
      )

    });
    return {
      fixtures: predictedFixtures,
      option: betOptions.find(option => option.id === betOptionsEnum.HOME_OR_DRAW) as betOptionModel,
    }; //TODO can look into making that betoption id a enumß
  };