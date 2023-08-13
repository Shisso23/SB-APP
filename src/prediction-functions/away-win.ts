import { betOptionsEnum } from "../enums/bet-options.enums";
import { betOptionModel } from "../models/bet-option-model";
import { FixtureDataModel } from "../models/fixtures";
import { StandingsDataStandingModel, StandingsModel } from "../models/standings-models";
import { betOptions } from "../variables/variables";
import { getLastFiveTeamHomeFixtures, againstAwayTeamGoalsPercentage, homeTeamGoalsPercentage, awayTeamGoalsPercentage, againstHomeTeamGoalsPercentage, awayTeamWinsMostMatchesTimes, otherAwayTeamGoalsInHomeFixtures, homeTeamFailWinningInMostHomeFixtures, awayTeamScroreInMostAwayFixtures, getAwayTeamStanding, getHomeTeamStanding, getLastFiveTeamAwayFixtures } from "./shared-functions";

export const predictAwayWin = ({
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
      const awayTeamStanding: StandingsDataStandingModel = getAwayTeamStanding({
        standings: leaguesStandings,
        awayTeamId: currentFixture.teams.away.id,
        leagueId: currentFixture.league.id,
      });
      const homeTeamStanding: StandingsDataStandingModel = getHomeTeamStanding({
        standings: leaguesStandings,
        homeTeamId: currentFixture.teams.home.id,
        leagueId: currentFixture.league.id,
      });
  
      if (lastFiveAwayTeamAwayFixtures.length < 3) {
        return false;
      }
      //TODO filter the fixtures that passes the H wins either half test here and return it
      return (
        ((awayTeamWinsMostMatchesTimes({
          fixtures: lastFiveAwayTeamAwayFixtures,
          awayTeamId: currentFixture.teams.away.id,
        }) &&
          otherAwayTeamGoalsInHomeFixtures({
            homeTeamFixtures: lastFiveHomeTeamHomeFixtures,
            goals: 1,
          }) &&
          homeTeamFailWinningInMostHomeFixtures({
            homefixtures: lastFiveHomeTeamHomeFixtures,
          }) &&
          awayTeamGoalsPercentage({ awayTeamStanding }) >= 160 &&
          againstHomeTeamGoalsPercentage({ homeTeamStanding }) >= 150) ||
          (awayTeamGoalsPercentage({ awayTeamStanding }) >= 160 &&
            homeTeamGoalsPercentage({ homeTeamStanding }) <= 80 &&
            againstHomeTeamGoalsPercentage({ homeTeamStanding }) >= 150)) &&
        awayTeamScroreInMostAwayFixtures({
          awayfixtures: lastFiveAwayTeamAwayFixtures,
          minGoals: 1,
        }) &&
        otherAwayTeamGoalsInHomeFixtures({
          homeTeamFixtures: lastFiveHomeTeamHomeFixtures,
          goals: 1,
        }) &&
        awayTeamGoalsPercentage({ awayTeamStanding }) >= 150 &&
        againstHomeTeamGoalsPercentage({ homeTeamStanding }) >= 130 &&
        againstAwayTeamGoalsPercentage({ awayTeamStanding }) <= 130 &&
        homeTeamFailWinningInMostHomeFixtures({
          homefixtures: lastFiveHomeTeamHomeFixtures,
        }) 
      ) ||  (awayTeamGoalsPercentage({awayTeamStanding})> homeTeamGoalsPercentage({homeTeamStanding}) && (againstAwayTeamGoalsPercentage({awayTeamStanding})- againstHomeTeamGoalsPercentage({homeTeamStanding}) <= -50) &&  homeTeamStanding.all.played>=4 && awayTeamStanding.all.played>=4);
    });
    return {
      fixtures: predictedFixtures,
      option: betOptions.find(option => option.id === betOptionsEnum.AWAY) as betOptionModel,
    }; //TODO can look into making that betoption id a enum
  };