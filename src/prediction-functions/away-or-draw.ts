import { betOptionModel } from "../models/bet-option-model";
import { FixtureDataModel } from "../models/fixtures";
import { StandingsDataStandingModel, StandingsModel } from "../models/standings-models";
import { betOptions } from "../variables/variables";
import { getLastFiveTeamHomeFixtures, againstAwayTeamGoalsPercentage, homeTeamGoalsPercentage, awayTeamGoalsPercentage, againstHomeTeamGoalsPercentage, homeTeamFailWinningInMostHomeFixtures, awayTeamWinsMostMatchesTimes, otherAwayTeamGoalsInHomeFixtures, homeTeamFailScroringInMostHomeFixtures, getAwayTeamStanding, getHomeTeamStanding, getLastFiveTeamAwayFixtures } from "./shared-functions";

export const predictAwayOrDraw = ({
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
      if (
        lastFiveHomeTeamHomeFixtures.length >= 3 &&
        lastFiveAwayTeamAwayFixtures.length >= 3
      ) {
        return (
          (((lastFiveAwayTeamAwayFixtures.every(
            fixtureData => fixtureData.teams.away.winner !== false,
          ) &&
            againstAwayTeamGoalsPercentage({ awayTeamStanding }) <= 130 &&
            homeTeamFailWinningInMostHomeFixtures({
              homefixtures: lastFiveHomeTeamHomeFixtures,
            }) &&
            homeTeamGoalsPercentage({ homeTeamStanding }) <= 80) ||
            (awayTeamWinsMostMatchesTimes({
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
          againstAwayTeamGoalsPercentage({ awayTeamStanding }) <= 130&&
          homeTeamFailWinningInMostHomeFixtures({
            homefixtures: lastFiveHomeTeamHomeFixtures,
          })) ||  againstAwayTeamGoalsPercentage({ awayTeamStanding }) <= 87 &&
          homeTeamGoalsPercentage({ homeTeamStanding }) <= 90  && homeTeamFailScroringInMostHomeFixtures({homefixtures: lastFiveHomeTeamHomeFixtures}) && (homeTeamStanding.rank> awayTeamStanding.rank )  && (homeTeamStanding.rank - awayTeamStanding.rank >=3)
        );
      }
      return false;
    });
    return {
      fixtures: predictedFixtures,
      option: betOptions.find(option => option.id === 27) as betOptionModel,
    }; //TODO can look into making that betoption id a enum
  };
  