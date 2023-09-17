import { betOptionsEnum } from "../enums/bet-options.enums";
import { betOptionModel } from "../models/bet-option-model";
import { FixtureDataModel } from "../models/fixtures";
import { StandingsDataStandingModel, StandingsModel } from "../models/standings-models";
import { betOptions } from "../variables/variables";
import { getLastFiveTeamHomeFixtures, againstAwayTeamGoalsPercentage, homeTeamGoalsPercentage, awayTeamGoalsPercentage, againstHomeTeamGoalsPercentage, awayTeamWinsMostMatchesTimes, otherAwayTeamGoalsInHomeFixtures, homeTeamFailWinningInMostHomeFixtures, awayTeamScroreInMostAwayFixtures, getAwayTeamStanding, getHomeTeamStanding, getLastFiveTeamAwayFixtures, getH2HFixtures } from "./shared-functions";

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
      const fixtureH2hFixtures = getH2HFixtures({
        teamOneId: currentFixture.teams.home.id,
        teamTwoId: currentFixture.teams.away.id,
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
  
      if (lastFiveAwayTeamAwayFixtures.length < 3 ||  (homeTeamStanding.all.played<3 && awayTeamStanding.all.played<3)) {
        return false;
      }
      //TODO filter the fixtures that passes the H wins either half test here and return it
      return ((awayTeamGoalsPercentage({ awayTeamStanding }) >= 160 &&
            homeTeamGoalsPercentage({ homeTeamStanding }) <= 80 &&
            againstHomeTeamGoalsPercentage({ homeTeamStanding }) >= 150) ||
((awayTeamGoalsPercentage({awayTeamStanding}) - homeTeamGoalsPercentage({homeTeamStanding})>= 100) && (againstAwayTeamGoalsPercentage({awayTeamStanding})- againstHomeTeamGoalsPercentage({homeTeamStanding}) <= -40))) && awayTeamWinsMostMatchesTimes({awayTeamId: awayTeamStanding.team.id, fixtures: fixtureH2hFixtures});
    });
    return {
      fixtures: predictedFixtures,
      option: betOptions.find(option => option.id === betOptionsEnum.AWAY) as betOptionModel,
    }; //TODO can look into making that betoption id a enum
  };