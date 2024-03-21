import { betOptionsEnum } from "../enums/bet-options.enums";
import { betOptionModel } from "../models/bet-option-model";
import { FixtureDataModel } from "../models/fixtures";
import { StandingsDataStandingModel, StandingsModel } from "../models/standings-models";
import { betOptions } from "../variables/variables";
import * as sharedFunctions from "./shared-functions";


export const predict1_2_goals_Away = ({
    currentFixtures,
    allFixtures,
    leaguesStandings,
  }: {
    currentFixtures: FixtureDataModel[];
    allFixtures: FixtureDataModel[];
    leaguesStandings: StandingsModel[];
  }) => {
    const predictedFixtures = currentFixtures.filter(currentFixture => {
      const allAwayTeamAwayFixtures = sharedFunctions.getAllAwayTeamAwayFixtures({allFixtures, currentSeason: currentFixture.league.season, teamId: currentFixture.teams.away.id})
      
      const allHomeTeamHomeFixtures = sharedFunctions.getAllHomeTeamHomeFixtures({allFixtures, currentSeason: currentFixture.league.season, teamId: currentFixture.teams.home.id})
      if(allAwayTeamAwayFixtures.length <3 || allHomeTeamHomeFixtures.length<3) return false
      const homeTeamAverageGoalsScored = sharedFunctions.averageGoalsScoredAtHome({homeTeamHomeFixtures: allHomeTeamHomeFixtures})
      const homeTeamAverageGoalsConceded = sharedFunctions.averageGoalsConcededAtHome({homeTeamHomeFixtures: allHomeTeamHomeFixtures})
      const awayTeamAverageGoalsScored = sharedFunctions.averageGoalsScoredAway({awayTeamAwayFixtures: allAwayTeamAwayFixtures})
      const awayTeamAverageGoalsConceded = sharedFunctions.averageGoalsConcededAway({awayTeamAwayFixtures: allAwayTeamAwayFixtures})

  
      return( 
        (sharedFunctions.teamMin1({teamAAverageGoalsScored:awayTeamAverageGoalsScored, teamBAverageGoalsConceded: homeTeamAverageGoalsConceded})) &&
        (sharedFunctions.teamMax2({teamAAverageGoalsScored:awayTeamAverageGoalsScored, teamBAverageGoalsConceded: homeTeamAverageGoalsConceded}))
      )
    });
    return {
      fixtures: predictedFixtures,
      option: betOptions.find(option => option.id === betOptionsEnum.AWAY_1_2_GOALS) as betOptionModel,
    }; 
  }