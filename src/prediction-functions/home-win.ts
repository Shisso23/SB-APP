import { betOptionsEnum } from "../enums/bet-options.enums";
import { betOptionModel } from "../models/bet-option-model";
import { FixtureDataModel } from "../models/fixtures";
import { StandingsDataStandingModel, StandingsModel } from "../models/standings-models";
import { betOptions } from "../variables/variables";
import { getLastFiveHomeTeamHomeFixtures, againstAwayTeamGoalsPercentage, homeTeamGoalsPercentage, awayTeamGoalsPercentage, againstHomeTeamGoalsPercentage, homeTeamWinsMostMatches, otherHomeTeamGoalsInAwayFixtures, awayTeamFailWinningInMostAwayFixtures, HomeTeamScroreInMostHomeFixtures, getAwayTeamStanding, getHomeTeamStanding, getLastFiveAwayTeamAwayFixtures, getH2HFixtures, teamDidNotWinLastFixture, getLastFiveTeamFixtures } from "./shared-functions";

export const predictHomeWin = ({
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

      const lastHomeTeamMatches = getLastFiveTeamFixtures({allFixtures, teamId: currentFixture.teams.home.id})

      if (lastFiveHomeTeamHomeFixtures.length >= 3 && (homeTeamStanding.all.played>=3 )) {
        return  homeTeamStanding.rank <5 && Math.abs(homeTeamStanding.rank - awayTeamStanding.rank)> 5 && homeTeamWinsMostMatches({fixtures: lastFiveHomeTeamHomeFixtures, homeTeamId: lastFiveHomeTeamHomeFixtures[0].teams.home.id})&& teamDidNotWinLastFixture({allPastFiveFixtures: lastHomeTeamMatches, teamId: currentFixture.teams.home.id})
        // return  (( homeTeamGoalsPercentage({ homeTeamStanding }) >= 160 &&
        // awayTeamGoalsPercentage({ awayTeamStanding }) <= 80 &&
        // againstAwayTeamGoalsPercentage({ awayTeamStanding }) >= 150
        // ) || ((homeTeamGoalsPercentage({homeTeamStanding}) - awayTeamGoalsPercentage({awayTeamStanding})>=100) && (againstHomeTeamGoalsPercentage({homeTeamStanding})- againstAwayTeamGoalsPercentage({awayTeamStanding}) <= -40))) && Math.abs(homeTeamStanding.rank - awayTeamStanding.rank)>=5; 
      }
      return false;
    });
    return {
      fixtures: predictedFixtures,
      option: betOptions.find(option => option.id === betOptionsEnum.HOME) as betOptionModel,
    }; //TODO can look into making that betoption id a enum
  };