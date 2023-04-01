import { betOptionModel } from "../models/bet-option-model";
import { FixtureDataModel } from "../models/fixtures";
import { StandingsDataStandingModel, StandingsModel } from "../models/standings-models";
import { betOptions } from "../variables/variables";
import { getLastFiveTeamHomeFixtures, HomeTeamScroreInMostHomeFixtures, otherHomeTeamGoalsInAwayFixtures, homeTeamGoalsPercentage, againstAwayTeamGoalsPercentage, getAwayTeamStanding, getHomeTeamStanding, getLastFiveTeamAwayFixtures } from "./shared-functions";


export const predictHomeOver0_5 = ({
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
  
      if (lastFiveHomeTeamHomeFixtures.length < 3) {
        return false;
      }
      return (
        HomeTeamScroreInMostHomeFixtures({
          homefixtures: lastFiveHomeTeamHomeFixtures,
          minGoals: 1,
        }) &&
        otherHomeTeamGoalsInAwayFixtures({
          awayTeamFixtures: lastFiveAwayTeamAwayFixtures,
          goals: 1,
        }) &&
        homeTeamGoalsPercentage({ homeTeamStanding }) >= 150 &&
         (homeTeamStanding?.rank< awayTeamStanding?.rank ) &&
  againstAwayTeamGoalsPercentage({ awayTeamStanding }) >= 130
      );
    });
    return {
      fixtures: predictedFixtures,
      option: betOptions.find(option => option.id === 15) as betOptionModel,
    }; // can look into making that betoption a enum
  };