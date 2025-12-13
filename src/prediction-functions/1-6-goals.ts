import { betOptionsEnum } from "../enums/bet-options.enums";
import { betOptionModel } from "../models/bet-option-model";
import { FixtureDataModel } from "../models/fixtures";
import {
  StandingsDataStandingModel,
  StandingsModel,
} from "../models/standings-models";
import { betOptions } from "../variables/variables";
import {
  getLastFiveHomeTeamHomeFixtures,
  awayTeamGoalsPercentage,
  againstHomeTeamGoalsPercentage,
  homeTeamGoalsPercentage,
  againstAwayTeamGoalsPercentage,
  getAwayTeamStanding,
  getHomeTeamStanding,
  getLastFiveAwayTeamAwayFixtures,
  getH2HFixtures,
} from "./shared-functions";

export const predict1_6_goals = ({
  currentFixtures,
  allFixtures,
  leaguesStandings,
}: {
  currentFixtures: FixtureDataModel[];
  allFixtures: FixtureDataModel[];
  leaguesStandings: StandingsModel[];
}) => {
  const predictedFixtures = currentFixtures.filter((currentFixture) => {
    const lastFiveHomeTeamHomeFixtures = getLastFiveHomeTeamHomeFixtures({
      teamId: currentFixture.teams.home.id,
      allFixtures,
    });

    const fixtureH2hFixtures = getH2HFixtures({
      teamOneId: currentFixture.teams.home.id,
      teamTwoId: currentFixture.teams.away.id,
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

    if (fixtureH2hFixtures.length < 3) {
      return false;
    }

    return (
      homeTeamGoalsPercentage({ homeTeamStanding }) >= 130 &&
      awayTeamGoalsPercentage({ awayTeamStanding }) >= 130 &&
      fixtureH2hFixtures.every((fixture) => {
        const totalGoals = fixture.goals.home + fixture.goals.away;
        return totalGoals >= 1 && totalGoals <= 6;
      })
    );
  });

  return {
    fixtures: predictedFixtures,
    option: betOptions.find(
      (option) => option.id === betOptionsEnum.TOTAL_1_6_GOALS
    ) as betOptionModel,
  };
};
