import { betOptionModel } from "../models/bet-option-model";
import { FixtureDataModel } from "../models/fixtures";
import { StandingsDataStandingModel, StandingsModel } from "../models/standings-models";
import { betOptions } from "../variables/variables";
import { getLastFiveTeamHomeFixtures, againstAwayTeamGoalsPercentage, homeTeamGoalsPercentage, awayTeamGoalsPercentage, againstHomeTeamGoalsPercentage, awayTeamFailWinningInMostAwayFixtures, homeTeamWinsMostMatches, otherHomeTeamGoalsInAwayFixtures, awayTeamFailScroringInMostAwayFixtures, getAwayTeamStanding, getHomeTeamStanding, getLastFiveTeamAwayFixtures } from "./shared-functions";

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
      if (
        lastFiveHomeTeamHomeFixtures.length >= 3 &&
        lastFiveAwayTeamAwayFixtures.length >= 3
      ) {
        return (
          (((lastFiveHomeTeamHomeFixtures.every(
            fixtureData => fixtureData.teams.home.winner !== false,
          ) &&
            againstHomeTeamGoalsPercentage({ homeTeamStanding }) <= 130 &&
            awayTeamFailWinningInMostAwayFixtures({
              awayFixtures: lastFiveAwayTeamAwayFixtures,
            }) &&
            awayTeamGoalsPercentage({ awayTeamStanding }) <= 80) ||
            (homeTeamWinsMostMatches({
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
          againstHomeTeamGoalsPercentage({ homeTeamStanding }) <= 130 &&
          awayTeamFailWinningInMostAwayFixtures({awayFixtures: lastFiveAwayTeamAwayFixtures})) || 
          againstHomeTeamGoalsPercentage({ homeTeamStanding }) <= 87 &&
          awayTeamGoalsPercentage({ awayTeamStanding }) <= 90  && awayTeamFailScroringInMostAwayFixtures({awayfixtures: lastFiveAwayTeamAwayFixtures}) && (awayTeamStanding?.rank > homeTeamStanding?.rank )  && (awayTeamStanding?.rank - homeTeamStanding?.rank <=3)
        );
      }
      return false;
    });
    return {
      fixtures: predictedFixtures,
      option: betOptions.find(option => option.id === 26) as betOptionModel,
    }; //TODO can look into making that betoption id a enum
  };