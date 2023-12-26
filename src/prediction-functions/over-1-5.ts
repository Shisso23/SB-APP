import { betOptionsEnum } from "../enums/bet-options.enums";
import { betOptionModel } from "../models/bet-option-model";
import { FixtureDataModel } from "../models/fixtures";
import { StandingsDataStandingModel, StandingsModel } from "../models/standings-models";
import { betOptions } from "../variables/variables";
import { getLastFiveHomeTeamHomeFixtures, awayTeamGoalsPercentage, againstHomeTeamGoalsPercentage, homeTeamGoalsPercentage, againstAwayTeamGoalsPercentage, getAwayTeamStanding, getHomeTeamStanding, getLastFiveAwayTeamAwayFixtures, getH2HFixtures, hasNoNilNilInFixtures, homeTeamMinGoals, awayTeamMinGoals } from "./shared-functions";

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
      return homeTeamMinGoals({homeTeamFixtures: lastFiveHomeTeamHomeFixtures, minGoals: 1, occurencePercentage: 100}) && awayTeamMinGoals({awayTeamFixtures: lastFiveAwayTeamAwayFixtures, minGoals:1,occurencePercentage: 80}) && 
      againstAwayTeamGoalsPercentage({awayTeamStanding})>=130 && againstHomeTeamGoalsPercentage({homeTeamStanding})>=130||
      (
       ( homeTeamGoalsPercentage({homeTeamStanding})>=150 && againstHomeTeamGoalsPercentage({homeTeamStanding})>=140) || (awayTeamGoalsPercentage({awayTeamStanding})>=150 && againstAwayTeamGoalsPercentage({awayTeamStanding})>=140)
      )

    });
    return {
      fixtures: predictedFixtures,
      option: betOptions.find(option => option.id === betOptionsEnum.OVER_1_5) as betOptionModel,
    };
  };