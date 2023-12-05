import { betOptionsEnum } from "../enums/bet-options.enums";
import { betOptionModel } from "../models/bet-option-model";
import { FixtureDataModel } from "../models/fixtures";
import { StandingsDataStandingModel, StandingsModel } from "../models/standings-models";
import { betOptions } from "../variables/variables";
import { getLastFiveHomeTeamHomeFixtures, awayTeamScroreInMostAwayFixtures, againstAwayTeamGoalsPercentage, getLastFiveAwayTeamAwayFixtures, getHomeTeamStanding, getAwayTeamStanding, homeTeamGoalsPercentage, homeTeamScroreInMostH2HFixtures, getH2HFixtures, awayTeamScroreInMostH2HFixtures, awayTeamGoalsPercentage, againstHomeTeamGoalsPercentage, hasNoNilNilInFixtures, otherAwayTeamGoalsInHomeFixtures, otherHomeTeamGoalsInAwayFixtures, awayTeamWinsMostMatchesTimes, mostFixturesAreBTTS, getLastFiveTeamFixtures, HomeTeamScroreInMostHomeFixtures } from "./shared-functions";


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
      const lastHomeTeamMatches = getLastFiveTeamFixtures({allFixtures, teamId: currentFixture.teams.home.id})
      const lastAwayTeamMatches = getLastFiveTeamFixtures({allFixtures, teamId: currentFixture.teams.away.id})
     
   
      if(!homeTeamStanding || !awayTeamStanding ||lastFiveAwayTeamAwayFixtures.length < 3 ||  awayTeamStanding.all.played<3) return false

      return (awayTeamStanding.rank < homeTeamStanding.rank && awayTeamGoalsPercentage({awayTeamStanding})>=180 && againstAwayTeamGoalsPercentage({awayTeamStanding})>=150 &&
        homeTeamGoalsPercentage({homeTeamStanding})>=130 && againstHomeTeamGoalsPercentage({homeTeamStanding})>=180) ||

        (againstHomeTeamGoalsPercentage({homeTeamStanding})>=160 && againstAwayTeamGoalsPercentage({awayTeamStanding})>=160 &&Math.abs(homeTeamGoalsPercentage({homeTeamStanding}) - awayTeamGoalsPercentage({awayTeamStanding}))<=30 )

    });
    return {
      fixtures: predictedFixtures,
      option: betOptions.find(option => option.id === betOptionsEnum.BOTH_TEAMS_TO_SCORE) as betOptionModel,
    };
  };