import { betOptionsEnum } from "../enums/bet-options.enums";
import { betOptionModel } from "../models/bet-option-model";
import { FixtureDataModel } from "../models/fixtures";
import { StandingsDataStandingModel, StandingsModel } from "../models/standings-models";
import { betOptions } from "../variables/variables";
import { getLastFiveHomeTeamHomeFixtures, awayTeamFailWinningInMostAwayFixtures, homeTeamWinsMostMatches, getAwayTeamStanding, getHomeTeamStanding, getLastFiveAwayTeamAwayFixtures, goodHomeTeamwinPercentage } from "./shared-functions";

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
      const lastFiveHomeTeamHomeFixtures = getLastFiveHomeTeamHomeFixtures({
        teamId: currentFixture.teams.home.id,
        allFixtures,
      });
      const lastFiveAwayTeamAwayFixtures = getLastFiveAwayTeamAwayFixtures({
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
     
      if ( homeTeamStanding && awayTeamStanding && lastFiveHomeTeamHomeFixtures.length >= 3 && homeTeamStanding.all.played>=3) {
        return  ((homeTeamStanding.rank <=6 && Math.abs(homeTeamStanding.rank - awayTeamStanding.rank)> 10 && homeTeamWinsMostMatches({fixtures: lastFiveHomeTeamHomeFixtures, homeTeamId: lastFiveHomeTeamHomeFixtures[0].teams.home.id}) )&& 
        (homeTeamStanding.points - awayTeamStanding.points)>5 && 
       ( awayTeamFailWinningInMostAwayFixtures({awayFixtures: lastFiveAwayTeamAwayFixtures})) ) ||( goodHomeTeamwinPercentage({awayStanding: awayTeamStanding, homeStanding: homeTeamStanding, lossPercentage: 50, winPercentage: 60})&& Math.abs(homeTeamStanding.rank - awayTeamStanding.rank)> 8 )
      }
      return false;

    });
    return {
      fixtures: predictedFixtures,
      option: betOptions.find(option => option.id === betOptionsEnum.HOME_OR_DRAW) as betOptionModel,
    }; //TODO can look into making that betoption id a enumß
  };