import { betOptionsEnum } from "../enums/bet-options.enums";
import { betOptionModel } from "../models/bet-option-model";
import { FixtureDataModel } from "../models/fixtures";
import { StandingsDataStandingModel, StandingsModel } from "../models/standings-models";
import { betOptions } from "../variables/variables";
import { getLastFiveTeamHomeFixtures, againstAwayTeamGoalsPercentage, againstHomeTeamGoalsPercentage, getH2HFixtures, getAwayTeamStanding, getHomeTeamStanding, getLastFiveTeamAwayFixtures } from "./shared-functions";


export const predictHTDraw = ({
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
        fixtureH2hFixtures.length < 2 ||
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
      option: betOptions.find((option) => option.id === betOptionsEnum.HT_DRAW) as betOptionModel,
    }; // can look into making that betoption a enum
  };