import { betOptionsEnum } from "../enums/bet-options.enums";
import { betOptionModel } from "../models/bet-option-model";
import { FixtureDataModel } from "../models/fixtures";
import { StandingsModel, StandingsDataStandingModel } from "../models/standings-models";
import { betOptions } from "../variables/variables";
import * as sharedFunctions from "./shared-functions";

export const predictMultiGoals0_3 = ({
    currentFixtures,
    allFixtures,
    leaguesStandings,
  }: {
    currentFixtures: FixtureDataModel[];
    allFixtures: FixtureDataModel[];
    leaguesStandings: StandingsModel[];
  }) => {
    const predictedFixtures = currentFixtures.filter((currentFixture) => {
      const allAwayTeamAwayFixtures = sharedFunctions.getAllAwayTeamAwayFixtures({allFixtures, currentSeason: currentFixture.league.season, teamId: currentFixture.teams.away.id})
      
      const allHomeTeamHomeFixtures = sharedFunctions.getAllHomeTeamHomeFixtures({allFixtures, currentSeason: currentFixture.league.season, teamId: currentFixture.teams.home.id})
      const head2HeadMatches = sharedFunctions.getH2HFixtures({allFixtures,teamOneId: currentFixture.teams.home.id,teamTwoId:currentFixture.teams.away.id  })
      if(allAwayTeamAwayFixtures.length <3 || allHomeTeamHomeFixtures.length<3 || head2HeadMatches.length === 0) return false

      const homeTeamAverageGoalsScored = sharedFunctions.averageGoalsScoredAtHome({homeTeamHomeFixtures: allHomeTeamHomeFixtures})
      const homeTeamAverageGoalsConceded = sharedFunctions.averageGoalsConcededAtHome({homeTeamHomeFixtures: allHomeTeamHomeFixtures})
      const awayTeamAverageGoalsScored = sharedFunctions.averageGoalsScoredAway({awayTeamAwayFixtures: allAwayTeamAwayFixtures})
      const awayTeamAverageGoalsConceded = sharedFunctions.averageGoalsConcededAway({awayTeamAwayFixtures: allAwayTeamAwayFixtures})

      
  
      return(( (sharedFunctions.teamMax1({teamAAverageGoalsScored:awayTeamAverageGoalsScored, teamBAverageGoalsConceded: homeTeamAverageGoalsConceded})) && (sharedFunctions.teamMax1({teamAAverageGoalsScored:homeTeamAverageGoalsScored, teamBAverageGoalsConceded: awayTeamAverageGoalsConceded})))||
      ( (sharedFunctions.teamMax2({teamAAverageGoalsScored:awayTeamAverageGoalsScored, teamBAverageGoalsConceded: homeTeamAverageGoalsConceded})) && (sharedFunctions.teamMax1({teamAAverageGoalsScored:homeTeamAverageGoalsScored, teamBAverageGoalsConceded: awayTeamAverageGoalsConceded})))||
      ( (sharedFunctions.teamMax1({teamAAverageGoalsScored:awayTeamAverageGoalsScored, teamBAverageGoalsConceded: homeTeamAverageGoalsConceded})) && (sharedFunctions.teamMax2({teamAAverageGoalsScored:homeTeamAverageGoalsScored, teamBAverageGoalsConceded: awayTeamAverageGoalsConceded})))) && (head2HeadMatches.every(match=> match.goals.home + match.goals.away < 4))
    });
    return {
      fixtures: predictedFixtures,
      option: betOptions.find((option) => option.id === betOptionsEnum.TOTAL_0_3_GOALS) as betOptionModel,
    }; // can look into making that betoption a enum
  };
