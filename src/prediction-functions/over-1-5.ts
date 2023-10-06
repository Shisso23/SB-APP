import { betOptionsEnum } from "../enums/bet-options.enums";
import { betOptionModel } from "../models/bet-option-model";
import { FixtureDataModel } from "../models/fixtures";
import { StandingsDataStandingModel, StandingsModel } from "../models/standings-models";
import { betOptions } from "../variables/variables";
import { getLastFiveHomeTeamHomeFixtures, awayTeamGoalsPercentage, againstHomeTeamGoalsPercentage, homeTeamGoalsPercentage, againstAwayTeamGoalsPercentage, getAwayTeamStanding, getHomeTeamStanding, getLastFiveAwayTeamAwayFixtures, getH2HFixtures, hasNoNilNilInFixtures } from "./shared-functions";

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
      const fixtureH2hFixtures = getH2HFixtures({
        teamOneId: currentFixture.teams.home.id,
        teamTwoId: currentFixture.teams.away.id,
        allFixtures,
      });
      
      const lastFiveHomeTeamHomeFixtures = getLastFiveHomeTeamHomeFixtures({
        teamId: currentFixture.teams.home.id,
        allFixtures,
      });
      const lastFiveAwayTeamAwayFixtures = getLastFiveAwayTeamAwayFixtures({
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
        lastFiveAwayTeamAwayFixtures.length < 3||
        fixtureH2hFixtures.length< 3
      ) {
        return false;
      }
      return (homeTeamGoalsPercentage({homeTeamStanding})>= 160 && awayTeamGoalsPercentage({awayTeamStanding})>=160) && homeTeamStanding.all.played>=2 && awayTeamStanding.all.played>=2 && fixtureH2hFixtures.every(fixture=> fixture.goals.away + fixture.goals.home >= 2)
      && hasNoNilNilInFixtures({fixtures: lastFiveHomeTeamHomeFixtures})  && hasNoNilNilInFixtures({fixtures: lastFiveAwayTeamAwayFixtures})   && hasNoNilNilInFixtures({fixtures: fixtureH2hFixtures});
    });
    return {
      fixtures: predictedFixtures,
      option: betOptions.find(option => option.id === betOptionsEnum.OVER_1_5) as betOptionModel,
    };
  };