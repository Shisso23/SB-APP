import { betOptionsEnum } from "../enums/bet-options.enums";
import { betOptionModel } from "../models/bet-option-model";
import { FixtureDataModel } from "../models/fixtures";
import { StandingsDataStandingModel, StandingsModel } from "../models/standings-models";
import { betOptions } from "../variables/variables";
import { getLastFiveHomeTeamHomeFixtures, againstAwayTeamGoalsPercentage, homeTeamGoalsPercentage, awayTeamGoalsPercentage, getH2HFixtures, againstHomeTeamGoalsPercentage, getAwayTeamStanding, getHomeTeamStanding, getLastFiveAwayTeamAwayFixtures, awayTeamWinsMostMatchesTimes, homeTeamWinsMostMatches } from "./shared-functions";

export const predictDraw = ({
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
      const fixtureH2hFixtures = getH2HFixtures({
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
        lastFiveAwayTeamAwayFixtures.length < 3 ||
        lastFiveHomeTeamHomeFixtures.length < 3||
        !homeTeamStanding||
        !awayTeamStanding
      ) {
        return false;
      }
      return (awayTeamStanding?.rank < homeTeamStanding?.rank && Math.abs(awayTeamStanding?.rank - homeTeamStanding?.rank)<=8  && Math.abs(againstAwayTeamGoalsPercentage({awayTeamStanding}) - homeTeamGoalsPercentage({homeTeamStanding}))<=5) && 
      (lastFiveHomeTeamHomeFixtures.every(fixture=> fixture.goals.home>= fixture.goals.away)) ||
      (Math.abs(againstAwayTeamGoalsPercentage({awayTeamStanding}) - againstHomeTeamGoalsPercentage({homeTeamStanding}))<10 && awayTeamStanding?.rank < homeTeamStanding?.rank )
      
    });
    return {
      fixtures: predictedFixtures,
      option: betOptions.find(option => option.id === betOptionsEnum.DRAW) as betOptionModel,
    }; // can look into making that betoption a enum
  };