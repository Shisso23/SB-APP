import { betOptionModel } from "../models/bet-option-model";
import { FixtureDataModel } from "../models/fixtures";
import { StandingsDataStandingModel, StandingsModel } from "../models/standings-models";
import { betOptions } from "../variables/variables";
import { getLastFiveTeamHomeFixtures, awayTeamScroreInMostAwayFixtures, againstAwayTeamGoalsPercentage, getLastFiveTeamAwayFixtures, getHomeTeamStanding, getAwayTeamStanding, homeTeamGoalsPercentage } from "./shared-functions";


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
      const lastFiveHomeTeamHomeFixtures = getLastFiveTeamHomeFixtures({
        teamId: currentFixture.teams.home.id,
        allFixtures,
      });
  
      const lastFiveAwayTeamAwayFixtures = getLastFiveTeamAwayFixtures({
        teamId: currentFixture.teams.away.id,
        allFixtures,
      });
      const homeTeamId =  lastFiveHomeTeamHomeFixtures[0].teams.home.id;
      const awayTeamId= lastFiveAwayTeamAwayFixtures[0].teams.away.id;
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
        lastFiveAwayTeamAwayFixtures.length < 3
      ) {
        return false;
      }
      return (awayTeamScroreInMostAwayFixtures({
          awayfixtures: lastFiveAwayTeamAwayFixtures,
          minGoals: 1,
        }) && (homeTeamStanding.rank> awayTeamStanding.rank ) && (homeTeamStanding.rank - awayTeamStanding.rank <=10) && againstAwayTeamGoalsPercentage({awayTeamStanding}) >=130 && homeTeamGoalsPercentage({homeTeamStanding})>= 145
      );
    });
    return {
      fixtures: predictedFixtures,
      option: betOptions.find(option => option.id === 0) as betOptionModel,
    };
  };