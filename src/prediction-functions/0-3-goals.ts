import { betOptionsEnum } from "../enums/bet-options.enums";
import { betOptionModel } from "../models/bet-option-model";
import { FixtureDataModel } from "../models/fixtures";
import { StandingsModel, StandingsDataStandingModel } from "../models/standings-models";
import { betOptions } from "../variables/variables";
import { getLastFiveTeamHomeFixtures, getLastFiveTeamAwayFixtures, getH2HFixtures, getHomeTeamStanding, getAwayTeamStanding, againstHomeTeamGoalsPercentage, againstAwayTeamGoalsPercentage } from "./shared-functions";

export const predictMultiGoals0_3 = ({
    currentFixtures,
    allFixtures,
    leaguesStandings,
  }: {
    currentFixtures: FixtureDataModel[];
    allFixtures: FixtureDataModel[];
    leaguesStandings: StandingsModel[];
  }) => {
    const predictedFixtures = currentFixtures.filter((currentFixture) => {
      const lastFiveHomeTeamHomeFixtures = getLastFiveTeamHomeFixtures({
        teamId: currentFixture.teams.home.id,
        allFixtures,
      });
      const lastFiveAwayTeamAwayFixtures = getLastFiveTeamAwayFixtures({
        teamId: currentFixture.teams.away.id,
        allFixtures,
      });
      const fixtureH2hFixtures = getH2HFixtures({
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
      if (
        lastFiveAwayTeamAwayFixtures.length < 3 ||
        lastFiveHomeTeamHomeFixtures.length < 3
      ) {
        return false;
      }
      return (
        ( ( homeTeamStanding?.all.goals.for/ homeTeamStanding?.all.played ) <= 0.85 &&  (awayTeamStanding?.all.goals.for/  awayTeamStanding?.all.played )<=0.85)||
        againstHomeTeamGoalsPercentage({ homeTeamStanding }) < 85 && againstAwayTeamGoalsPercentage({ awayTeamStanding }) < 85
        ) && (homeTeamStanding?.rank> awayTeamStanding?.rank );
    });
    return {
      fixtures: predictedFixtures,
      option: betOptions.find((option) => option.id === betOptionsEnum.TOTAL_0_3_GOALS) as betOptionModel,
    }; // can look into making that betoption a enum
  };