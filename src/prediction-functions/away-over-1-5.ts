import { betOptionsEnum } from "../enums/bet-options.enums";
import { betOptionModel } from "../models/bet-option-model";
import { FixtureDataModel } from "../models/fixtures";
import { StandingsDataStandingModel, StandingsModel } from "../models/standings-models";
import { betOptions } from "../variables/variables";
import {getLastFiveTeamAwayFixtures, awayTeamMinGoals, teamMinGoalsInH2H, getH2HFixtures, awayTeamScroreInMostAwayFixtures, otherAwayTeamGoalsInHomeFixtures, awayTeamGoalsPercentage, againstHomeTeamGoalsPercentage, getHomeTeamStanding, getAwayTeamStanding, getLastFiveTeamHomeFixtures } from "./shared-functions";


export const predictAwayOver1_5 = ({
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
      const h2hFixtures = getH2HFixtures({
        teamOneId: currentFixture.teams.home.id,
        teamTwoId: currentFixture.teams.away.id,
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
      const isAwayOver0_5 =  awayTeamScroreInMostAwayFixtures({
        awayfixtures: lastFiveAwayTeamAwayFixtures,
        minGoals: 1,
      }) &&
      otherAwayTeamGoalsInHomeFixtures({
        homeTeamFixtures: lastFiveHomeTeamHomeFixtures,
        goals: 1,
      }) &&
      awayTeamGoalsPercentage({ awayTeamStanding }) >= 150 &&
        (awayTeamStanding?.rank< homeTeamStanding?.rank ) &&
      againstHomeTeamGoalsPercentage({ homeTeamStanding }) >= 130
      if (lastFiveAwayTeamAwayFixtures.length < 3 || h2hFixtures.length<3) {
        return false;
      }
      return (
       isAwayOver0_5 &&
        awayTeamMinGoals({awayTeamFixtures: lastFiveAwayTeamAwayFixtures, minGoals:2, occurencePercentage: 80}) && teamMinGoalsInH2H({h2hFixtures, minGoals: 2, teamId: lastFiveAwayTeamAwayFixtures[0].teams.away.id,occurencePercentage: 60})
      );
    });
    return {
      fixtures: predictedFixtures,
      option: betOptions.find(option => option.id === betOptionsEnum.AWAY_OVER_1_5) as betOptionModel,
    };
  };