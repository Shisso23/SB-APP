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
      const head2HeadMatches = sharedFunctions.getH2HFixtures({allFixtures,teamOneId: currentFixture.teams.home.id,teamTwoId:currentFixture.teams.away.id  })
     
      const allAwayTeamAwayFixtures = sharedFunctions.getAllAwayTeamAwayFixtures({allFixtures, currentSeason: currentFixture.league.season, teamId: currentFixture.teams.away.id})
      
      const allHomeTeamHomeFixtures = sharedFunctions.getAllHomeTeamHomeFixtures({allFixtures, currentSeason: currentFixture.league.season, teamId: currentFixture.teams.home.id})
      if(allAwayTeamAwayFixtures.length <3 || allHomeTeamHomeFixtures.length<3   || !awayTeamStanding||
        !homeTeamStanding) return false
        
      const homeTeamAverageGoalsScored = sharedFunctions.averageGoalsScoredAtHome({homeTeamHomeFixtures: allHomeTeamHomeFixtures})
      const homeTeamAverageGoalsConceded = sharedFunctions.averageGoalsConcededAtHome({homeTeamHomeFixtures: allHomeTeamHomeFixtures})
      const awayTeamAverageGoalsScored = sharedFunctions.averageGoalsScoredAway({awayTeamAwayFixtures: allAwayTeamAwayFixtures})
      const awayTeamAverageGoalsConceded = sharedFunctions.averageGoalsConcededAway({awayTeamAwayFixtures: allAwayTeamAwayFixtures})

      return ((
        (sharedFunctions.teamMin2({
          teamAAverageGoalsScored: homeTeamAverageGoalsScored,
          teamBAverageGoalsConceded: awayTeamAverageGoalsConceded,
        }) &&
          sharedFunctions.teamMax0({
            teamAAverageGoalsScored: awayTeamAverageGoalsScored,
            teamBAverageGoalsConceded: homeTeamAverageGoalsConceded,
          })) ||
        (sharedFunctions.teamMin3({
          teamAAverageGoalsScored: homeTeamAverageGoalsScored,
          teamBAverageGoalsConceded: awayTeamAverageGoalsConceded,
        }) &&
          sharedFunctions.teamMax1({
            teamAAverageGoalsScored: awayTeamAverageGoalsScored,
            teamBAverageGoalsConceded: homeTeamAverageGoalsConceded,
          })) ||
        (sharedFunctions.teamMin4({
          teamAAverageGoalsScored: homeTeamAverageGoalsScored,
          teamBAverageGoalsConceded: awayTeamAverageGoalsConceded,
        }) &&
          sharedFunctions.teamMax2({
            teamAAverageGoalsScored: awayTeamAverageGoalsScored,
            teamBAverageGoalsConceded: homeTeamAverageGoalsConceded,
          }))
      ) || (sharedFunctions.teamMax0({teamAAverageGoalsScored:awayTeamAverageGoalsScored, teamBAverageGoalsConceded: homeTeamAverageGoalsConceded}))) && 
      (homeTeamStanding.rank < awayTeamStanding.rank) && (Math.abs(homeTeamStanding.rank - awayTeamStanding.rank)> 3) &&
      head2HeadMatches.every(match =>( match.goals.home >= match.goals.away && match.teams.home.id === currentFixture.teams.home.id) || (match.goals.away>= match.goals.home && match.teams.away.id === currentFixture.teams.home.id))

    });
    return {
      fixtures: predictedFixtures,
      option: betOptions.find(option => option.id === betOptionsEnum.HOME_OR_DRAW) as betOptionModel,
    };
  };