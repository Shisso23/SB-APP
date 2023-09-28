import { betOptionsEnum } from "../enums/bet-options.enums";
import { betOptionModel } from "../models/bet-option-model";
import { FixtureDataModel } from "../models/fixtures";
import { StandingsDataStandingModel, StandingsModel } from "../models/standings-models";
import { betOptions } from "../variables/variables";
import { getLastFiveTeamHomeFixtures, awayTeamGoalsPercentage, againstHomeTeamGoalsPercentage, homeTeamGoalsPercentage, againstAwayTeamGoalsPercentage, getAwayTeamStanding, getHomeTeamStanding, getLastFiveTeamAwayFixtures, getH2HFixtures, hasNoNilNilInFixtures } from "./shared-functions";

export const predictOver0_5 = ({
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

      const fixtureH2hFixtures = getH2HFixtures({
        teamOneId: currentFixture.teams.home.id,
        teamTwoId: currentFixture.teams.away.id,
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
        fixtureH2hFixtures.length< 3
      ) {
        return false;
      }
      return (homeTeamGoalsPercentage({homeTeamStanding})>= 120 && awayTeamGoalsPercentage({awayTeamStanding})>=120) && fixtureH2hFixtures.every(fixture=> fixture.goals.away + fixture.goals.home >= 1) 
       && hasNoNilNilInFixtures({fixtures: lastFiveHomeTeamHomeFixtures})  && hasNoNilNilInFixtures({fixtures: lastFiveAwayTeamAwayFixtures});
    });
    return {
      fixtures: predictedFixtures,
      option: betOptions.find(option => option.id === betOptionsEnum.OVER_0_5) as betOptionModel,
    };
  };