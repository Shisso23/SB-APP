import { betOptionModel } from "../models/bet-option-model";
import { FixtureDataModel } from "../models/fixtures";
import { StandingsDataStandingModel, StandingsModel } from "../models/standings-models";
import { betOptions } from "../variables/variables";
import { getLastFiveTeamHomeFixtures, awayTeamGoalsPercentage, againstHomeTeamGoalsPercentage, homeTeamGoalsPercentage, againstAwayTeamGoalsPercentage, getAwayTeamStanding, getHomeTeamStanding, getLastFiveTeamAwayFixtures } from "./shared-functions";

export const predictOver1_5 = ({
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
        lastFiveHomeTeamHomeFixtures.length < 3 ||
        lastFiveAwayTeamAwayFixtures.length < 3
      ) {
        return false;
      }
      return (
       ( homeTeamGoalsPercentage({ homeTeamStanding }) >= 140 &&
        awayTeamGoalsPercentage({ awayTeamStanding }) >= 140 &&
        (againstAwayTeamGoalsPercentage({ awayTeamStanding }) >= 170 &&
          againstHomeTeamGoalsPercentage({ homeTeamStanding }) >= 170)) || (homeTeamGoalsPercentage({homeTeamStanding})>=180 &&(homeTeamStanding?.rank < awayTeamStanding?.rank) && againstAwayTeamGoalsPercentage({awayTeamStanding})>=150)
      ) || (homeTeamGoalsPercentage({homeTeamStanding})>= 160 && awayTeamGoalsPercentage({awayTeamStanding})>=160);
    });
    return {
      fixtures: predictedFixtures,
      option: betOptions.find(option => option.id === 3) as betOptionModel,
    };
  };