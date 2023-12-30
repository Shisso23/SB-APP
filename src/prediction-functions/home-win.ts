import { betOptionsEnum } from "../enums/bet-options.enums";
import { betOptionModel } from "../models/bet-option-model";
import { FixtureDataModel } from "../models/fixtures";
import { StandingsDataStandingModel, StandingsModel } from "../models/standings-models";
import { betOptions } from "../variables/variables";
import { getLastFiveHomeTeamHomeFixtures, againstAwayTeamGoalsPercentage, homeTeamGoalsPercentage, awayTeamGoalsPercentage, againstHomeTeamGoalsPercentage, homeTeamWinsMostMatches, otherHomeTeamGoalsInAwayFixtures, awayTeamFailWinningInMostAwayFixtures, HomeTeamScroreInMostHomeFixtures, getAwayTeamStanding, getHomeTeamStanding, getLastFiveAwayTeamAwayFixtures, getH2HFixtures, getLastFiveTeamFixtures, teamDidNotWinLastFixture, awayTeamFailScroringInMostAwayFixtures, teamDidNotLoseLastFixture, goodHomeTeamwinPercentage } from "./shared-functions";

export const predictHomeWin = ({
    currentFixtures,
    allFixtures,
    leaguesStandings,
  }: {
    currentFixtures: FixtureDataModel[];
    allFixtures: FixtureDataModel[];
    leaguesStandings: StandingsModel[];
  }) => {
    const predictedFixtures = currentFixtures?.filter(currentFixture => {
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

      const lastHomeTeamMatches = getLastFiveTeamFixtures({allFixtures, teamId: currentFixture.teams.home.id})
      const lastAwayTeamMatches = getLastFiveTeamFixtures({allFixtures, teamId: currentFixture.teams.away.id})

      if ( homeTeamStanding && awayTeamStanding && lastFiveHomeTeamHomeFixtures.length >= 3 && homeTeamStanding.all.played>=3) {
        return  ((homeTeamStanding.rank <=4 && Math.abs(homeTeamStanding.rank - awayTeamStanding.rank)> 5 && homeTeamWinsMostMatches({fixtures: lastFiveHomeTeamHomeFixtures, homeTeamId: lastFiveHomeTeamHomeFixtures[0].teams.home.id}) )&& 
       (homeTeamStanding.points - awayTeamStanding.points)>5 && 
      ( awayTeamFailWinningInMostAwayFixtures({awayFixtures: lastFiveAwayTeamAwayFixtures})) ) || goodHomeTeamwinPercentage({awayStanding: awayTeamStanding, homeStanding: homeTeamStanding, lossPercentage: 70, winPercentage: 70})
      }
      return false;
    });
    return {
      fixtures: predictedFixtures,
      option: betOptions.find(option => option.id === betOptionsEnum.HOME) as betOptionModel,
    }; //TODO can look into making that betoption id a enum
  };