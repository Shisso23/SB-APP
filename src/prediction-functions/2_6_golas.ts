import { betOptionsEnum } from "../enums/bet-options.enums";
import { betOptionModel } from "../models/bet-option-model";
import { FixtureDataModel } from "../models/fixtures";
import { StandingsDataStandingModel, StandingsModel } from "../models/standings-models";
import { betOptions } from "../variables/variables";
import { getLastFiveTeamHomeFixtures, awayTeamGoalsPercentage, homeTeamGoalsPercentage, getAwayTeamStanding, getHomeTeamStanding, getLastFiveTeamAwayFixtures, getH2HFixtures } from "./shared-functions";

export const predict2_6_goals = ({
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
        lastFiveAwayTeamAwayFixtures.length < 3||
        fixtureH2hFixtures.length < 3
      ) {
        return false;
      }
      return( (homeTeamGoalsPercentage({homeTeamStanding})>= 160 && awayTeamGoalsPercentage({awayTeamStanding})>=160) && homeTeamStanding.all.played>=2 && awayTeamStanding.all.played>=2) 
      && (fixtureH2hFixtures.every(fixture=> fixture.goals.away + fixture.goals.home <= 5 ));
    });
    return {
      fixtures: predictedFixtures,
      option: betOptions.find(option => option.id === betOptionsEnum.TOTAL_2_6_GOALS) as betOptionModel,
    };
  };