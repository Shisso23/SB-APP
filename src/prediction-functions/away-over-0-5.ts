import { betOptionsEnum } from "../enums/bet-options.enums";
import { betOptionModel } from "../models/bet-option-model";
import { FixtureDataModel } from "../models/fixtures";
import { StandingsDataStandingModel, StandingsModel } from "../models/standings-models";
import { betOptions } from "../variables/variables";
import { getLastFiveHomeTeamHomeFixtures, awayTeamScroreInMostAwayFixtures, otherAwayTeamGoalsInHomeFixtures, awayTeamGoalsPercentage, againstHomeTeamGoalsPercentage, getAwayTeamStanding, getHomeTeamStanding, getLastFiveAwayTeamAwayFixtures, getH2HFixtures, awayTeamScroreInMostH2HFixtures, hasNoNilNilInFixtures } from "./shared-functions";


export const predictAwayOver0_5 = ({
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
      if (lastFiveAwayTeamAwayFixtures.length < 3) {
        return false;
      }
      // return (
      //   awayTeamScroreInMostAwayFixtures({
      //     awayfixtures: lastFiveAwayTeamAwayFixtures,
      //     minGoals: 1,
      //   }) &&
      //   otherAwayTeamGoalsInHomeFixtures({
      //     homeTeamFixtures: lastFiveHomeTeamHomeFixtures,
      //     goals: 1,
      //   }) &&
      //   awayTeamGoalsPercentage({ awayTeamStanding }) >= 150 &&
      //     (awayTeamStanding?.rank< homeTeamStanding?.rank ) &&
      //   againstHomeTeamGoalsPercentage({ homeTeamStanding }) >= 130
      // )  && hasNoNilNilInFixtures({fixtures: fixtureH2hFixtures}) && hasNoNilNilInFixtures({fixtures: lastFiveAwayTeamAwayFixtures})
      return  awayTeamGoalsPercentage({ awayTeamStanding }) >= 200 && againstHomeTeamGoalsPercentage({homeTeamStanding})>=130
    });
    return {
      fixtures: predictedFixtures,
      option: betOptions.find(option => option.id === betOptionsEnum.AWAY_OVER_0_5) as betOptionModel,
    }; // can look into making that betoption a enum
  };
  