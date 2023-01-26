import { getAwayTeamStanding, getHomeTeamStanding, getLastFiveTeamAwayFixtures } from "../helpers/prediction";
import { betOptionModel } from "../models/bet-option-model";
import { FixtureDataModel } from "../models/fixtures";
import { StandingsDataStandingModel, StandingsModel } from "../models/standings-models";
import { betOptions } from "../variables/variables";
import { getLastFiveTeamHomeFixtures, againstHomeTeamGoalsPercentage, awayTeamGoalsPercentage, awayTeamFailScroringInMostAwayFixtures } from "./shared-functions";

export const predictHomeCleanSheet = ({
    currentFixtures,
    allFixtures,
    leaguesStandings,
  }: {
    currentFixtures: FixtureDataModel[];
    allFixtures: FixtureDataModel[];
    leaguesStandings: StandingsModel[];
  }) => {
    const predictedFixtures = currentFixtures.filter(currentFixture => {
      const lastFiveAwayTeamAwayFixtures = getLastFiveTeamAwayFixtures({
        teamId: currentFixture.teams.away.id,
        allFixtures,
      });
      const lastFiveHomeTeamHomeFixtures = getLastFiveTeamHomeFixtures({
        teamId: currentFixture.teams.home.id,
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
  
      if (lastFiveAwayTeamAwayFixtures.length < 3) {
        return false;
      }
      //TODO filter the fixtures that passes the H wins either half test here and return it
      return (
        againstHomeTeamGoalsPercentage({ homeTeamStanding }) <= 87 &&
        awayTeamGoalsPercentage({ awayTeamStanding }) <= 90  && awayTeamFailScroringInMostAwayFixtures({awayfixtures: lastFiveAwayTeamAwayFixtures}) && (awayTeamStanding.rank > homeTeamStanding.rank )  && (awayTeamStanding.rank - homeTeamStanding.rank <=3)
      );
    });
    return {
      fixtures: predictedFixtures,
      option: betOptions.find(option => option.id === 28) as betOptionModel,
    }; //TODO can look into making that betoption id a enum
  };
