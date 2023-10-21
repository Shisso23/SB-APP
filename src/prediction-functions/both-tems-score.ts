import { betOptionsEnum } from "../enums/bet-options.enums";
import { betOptionModel } from "../models/bet-option-model";
import { FixtureDataModel } from "../models/fixtures";
import { StandingsDataStandingModel, StandingsModel } from "../models/standings-models";
import { betOptions } from "../variables/variables";
import { getLastFiveHomeTeamHomeFixtures, awayTeamScroreInMostAwayFixtures, againstAwayTeamGoalsPercentage, getLastFiveAwayTeamAwayFixtures, getHomeTeamStanding, getAwayTeamStanding, homeTeamGoalsPercentage, homeTeamScroreInMostH2HFixtures, getH2HFixtures, awayTeamScroreInMostH2HFixtures, awayTeamGoalsPercentage, againstHomeTeamGoalsPercentage, hasNoNilNilInFixtures, otherAwayTeamGoalsInHomeFixtures, otherHomeTeamGoalsInAwayFixtures, awayTeamWinsMostMatchesTimes } from "./shared-functions";


export const predictBothTeamsToScore = ({
    currentFixtures,
    allFixtures,
    leaguesStandings,
  }: {
    currentFixtures: FixtureDataModel[];
    allFixtures: FixtureDataModel[];
    leaguesStandings: StandingsModel[];
  }) => {
    const predictedFixtures = currentFixtures.filter(currentFixture => {
      const lastFiveHomeTeamHomeFixtures = getLastFiveHomeTeamHomeFixtures({
        teamId: currentFixture.teams.home.id,
        allFixtures,
      });
  
      const lastFiveAwayTeamAwayFixtures = getLastFiveAwayTeamAwayFixtures({
        teamId: currentFixture.teams.away.id,
        allFixtures,
      });
      const h2hFixtures = getH2HFixtures({
        teamOneId: currentFixture.teams.home.id,
        teamTwoId: currentFixture.teams.away.id,
        allFixtures,
      });

      const homeTeamStanding: StandingsDataStandingModel = getHomeTeamStanding({
        standings: leaguesStandings,
        homeTeamId: currentFixture.teams.home.id,
        leagueId: currentFixture.league.id,
      });
      
      const awayTeamStanding: StandingsDataStandingModel = getAwayTeamStanding({
        standings: leaguesStandings,
        awayTeamId: currentFixture.teams.away.id,
        leagueId: currentFixture.league.id,
      });

      if (
        lastFiveHomeTeamHomeFixtures.length < 3 ||
        lastFiveAwayTeamAwayFixtures.length < 3 ||
        h2hFixtures.length <3||
        !homeTeamStanding||
        !awayTeamStanding
      ) {
        return false;
      }
      const homeTeamId =  lastFiveHomeTeamHomeFixtures[0].teams.home.id;
      const awayTeamId= lastFiveAwayTeamAwayFixtures[0].teams.away.id;
     
   
   
      // return (((Math.abs(homeTeamStanding?.rank - awayTeamStanding?.rank) <=6 && againstAwayTeamGoalsPercentage({awayTeamStanding}) >=130 && homeTeamStanding?.rank> awayTeamStanding?.rank ) && ((awayTeamScroreInMostAwayFixtures({
      //     awayfixtures: lastFiveAwayTeamAwayFixtures,
      //     minGoals: 1,
      //   }) &&  homeTeamGoalsPercentage({homeTeamStanding})>= 140
      // ) || (homeTeamScroreInMostH2HFixtures({h2hFixtures, homeTeamId,minGoals: 1}) && awayTeamScroreInMostH2HFixtures({awayTeamId,h2hFixtures,minGoals: 1}) &&  homeTeamGoalsPercentage({homeTeamStanding})>=150 && awayTeamGoalsPercentage({awayTeamStanding})>=150)))
      // || (homeTeamGoalsPercentage({homeTeamStanding})>= 180 && awayTeamGoalsPercentage({awayTeamStanding})>=180 && againstAwayTeamGoalsPercentage({awayTeamStanding}) >=130 && againstHomeTeamGoalsPercentage({homeTeamStanding}) >=130))
      //  && hasNoNilNilInFixtures({fixtures: h2hFixtures})  && hasNoNilNilInFixtures({fixtures: lastFiveHomeTeamHomeFixtures})  && hasNoNilNilInFixtures({fixtures: lastFiveAwayTeamAwayFixtures}); 
      if(!homeTeamStanding || !awayTeamStanding ||lastFiveAwayTeamAwayFixtures.length < 3 ||  awayTeamStanding.all.played<3) return false
      return ( (awayTeamStanding.rank <5 && Math.abs(awayTeamStanding.rank - homeTeamStanding.rank)>=4 && awayTeamWinsMostMatchesTimes({fixtures: lastFiveAwayTeamAwayFixtures, awayTeamId: lastFiveAwayTeamAwayFixtures[0].teams.away.id})) && 
      (awayTeamStanding.points - homeTeamStanding.points)>5 && homeTeamGoalsPercentage({homeTeamStanding})>=150)

    });
    return {
      fixtures: predictedFixtures,
      option: betOptions.find(option => option.id === betOptionsEnum.BOTH_TEAMS_TO_SCORE) as betOptionModel,
    };
  };