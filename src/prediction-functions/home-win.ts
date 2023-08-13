import { betOptionsEnum } from "../enums/bet-options.enums";
import { betOptionModel } from "../models/bet-option-model";
import { FixtureDataModel } from "../models/fixtures";
import { StandingsDataStandingModel, StandingsModel } from "../models/standings-models";
import { betOptions } from "../variables/variables";
import { getLastFiveTeamHomeFixtures, againstAwayTeamGoalsPercentage, homeTeamGoalsPercentage, awayTeamGoalsPercentage, againstHomeTeamGoalsPercentage, homeTeamWinsMostMatches, otherHomeTeamGoalsInAwayFixtures, awayTeamFailWinningInMostAwayFixtures, HomeTeamScroreInMostHomeFixtures, getAwayTeamStanding, getHomeTeamStanding, getLastFiveTeamAwayFixtures } from "./shared-functions";

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
      const lastFiveHomeTeamHomeFixtures = getLastFiveTeamHomeFixtures({
        teamId: currentFixture.teams.home.id,
        allFixtures,
      });
      const lastFiveAwayTeamAwayFixtures = getLastFiveTeamAwayFixtures({
        teamId: currentFixture.teams.away.id,
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
      if (lastFiveHomeTeamHomeFixtures.length >= 3) {
        return (
          ((homeTeamWinsMostMatches({
            fixtures: lastFiveHomeTeamHomeFixtures,
            homeTeamId: currentFixture.teams.home.id,
          }) &&
            otherHomeTeamGoalsInAwayFixtures({
              awayTeamFixtures: lastFiveAwayTeamAwayFixtures,
              goals: 1,
            }) &&
            awayTeamFailWinningInMostAwayFixtures({
              awayFixtures: lastFiveAwayTeamAwayFixtures,
            }) &&
            homeTeamGoalsPercentage({ homeTeamStanding }) >= 160 &&
            againstAwayTeamGoalsPercentage({ awayTeamStanding }) >= 150) ||
            (homeTeamGoalsPercentage({ homeTeamStanding }) >= 160 &&
              awayTeamGoalsPercentage({ awayTeamStanding }) <= 80 &&
              againstAwayTeamGoalsPercentage({ awayTeamStanding }) >= 150)) &&
          HomeTeamScroreInMostHomeFixtures({
            homefixtures: lastFiveHomeTeamHomeFixtures,
            minGoals: 1,
          }) &&
          otherHomeTeamGoalsInAwayFixtures({
            awayTeamFixtures: lastFiveAwayTeamAwayFixtures,
            goals: 1,
          }) &&
          homeTeamGoalsPercentage({ homeTeamStanding }) >= 150 &&
          againstAwayTeamGoalsPercentage({ awayTeamStanding }) >= 130 &&
          againstHomeTeamGoalsPercentage({ homeTeamStanding }) <= 120 && awayTeamFailWinningInMostAwayFixtures({awayFixtures: lastFiveAwayTeamAwayFixtures})
        ) || (homeTeamGoalsPercentage({homeTeamStanding})> awayTeamGoalsPercentage({awayTeamStanding}) && (againstHomeTeamGoalsPercentage({homeTeamStanding})- againstAwayTeamGoalsPercentage({awayTeamStanding}) <= -50) && homeTeamStanding.all.played>=4 && awayTeamStanding.all.played>=4); 
      }
      return false;
    });
    return {
      fixtures: predictedFixtures,
      option: betOptions.find(option => option.id === betOptionsEnum.HOME) as betOptionModel,
    }; //TODO can look into making that betoption id a enum
  };