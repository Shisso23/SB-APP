import { betOptionsEnum } from "../enums/bet-options.enums";
import { betOptionModel } from "../models/bet-option-model";
import { FixtureDataModel } from "../models/fixtures";
import { StandingsDataStandingModel, StandingsModel } from "../models/standings-models";
import { betOptions } from "../variables/variables";
import { getLastFiveTeamHomeFixtures, awayTeamGoalsPercentage, againstHomeTeamGoalsPercentage, homeTeamGoalsPercentage, againstAwayTeamGoalsPercentage, awayTeamFailWinningInMostAwayFixtures, HomeTeamScroreInMostHomeFixtures, otherHomeTeamGoalsInAwayFixtures, homeTeamWinsMostMatches, getAwayTeamStanding, getHomeTeamStanding, getLastFiveTeamAwayFixtures } from "./shared-functions";

export const predictHomeWinsEitherHalf = ({
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
            againstAwayTeamGoalsPercentage({ awayTeamStanding }) >= 140) ||
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
          againstHomeTeamGoalsPercentage({ homeTeamStanding }) <= 130 &&
          awayTeamFailWinningInMostAwayFixtures({awayFixtures: lastFiveAwayTeamAwayFixtures})
        );
      }
      return false;
    });
  
    return {
      fixtures: predictedFixtures,
      option: betOptions.find(option => option.id === betOptionsEnum.HOME_WINS_EITHER_HALF) as betOptionModel,
    }; //TODO can look into making that betoption a enum
  };
  