import { betOptionsEnum } from "../enums/bet-options.enums";
import { betOptionModel } from "../models/bet-option-model";
import { FixtureDataModel } from "../models/fixtures";
import {
  StandingsDataStandingModel,
  StandingsModel,
} from "../models/standings-models";
import { betOptions } from "../variables/variables";
import * as sharedFunctions from "./shared-functions";

export const predictHomeOver0_5 = ({
  currentFixtures,
  allFixtures,
  leaguesStandings,
}: {
  currentFixtures: FixtureDataModel[];
  allFixtures: FixtureDataModel[];
  leaguesStandings: StandingsModel[];
}) => {
  const predictedFixtures = currentFixtures.filter((currentFixture) => {
    const allAwayTeamAwayFixtures = sharedFunctions.getAllAwayTeamAwayFixtures({
      allFixtures,
      currentSeason: currentFixture.league.season,
      teamId: currentFixture.teams.away.id,
    });
    const head2HeadMatches = sharedFunctions.getH2HFixtures({
      allFixtures,
      teamOneId: currentFixture.teams.home.id,
      teamTwoId: currentFixture.teams.away.id,
    });
    const awayTeamStanding: StandingsDataStandingModel =
      sharedFunctions.getAwayTeamStanding({
        standings: leaguesStandings,
        awayTeamId: currentFixture.teams.away.id,
        leagueId: currentFixture.league.id,
      });
    const homeTeamStanding: StandingsDataStandingModel =
      sharedFunctions.getHomeTeamStanding({
        standings: leaguesStandings,
        homeTeamId: currentFixture.teams.home.id,
        leagueId: currentFixture.league.id,
      });

    const allHomeTeamHomeFixtures = sharedFunctions.getAllHomeTeamHomeFixtures({
      allFixtures,
      currentSeason: currentFixture.league.season,
      teamId: currentFixture.teams.home.id,
    });
    if (
      allAwayTeamAwayFixtures.length < 3 ||
      allHomeTeamHomeFixtures.length < 3 ||
      head2HeadMatches.length === 0 ||
      !awayTeamStanding
    )
      return false;
    const homeTeamAverageGoalsScored = sharedFunctions.averageGoalsScoredAtHome(
      { homeTeamHomeFixtures: allHomeTeamHomeFixtures }
    );
    const homeTeamAverageGoalsConceded =
      sharedFunctions.averageGoalsConcededAtHome({
        homeTeamHomeFixtures: allHomeTeamHomeFixtures,
      });
    const awayTeamAverageGoalsScored = sharedFunctions.averageGoalsScoredAway({
      awayTeamAwayFixtures: allAwayTeamAwayFixtures,
    });
    const awayTeamAverageGoalsConceded =
      sharedFunctions.averageGoalsConcededAway({
        awayTeamAwayFixtures: allAwayTeamAwayFixtures,
      });

    return (
      sharedFunctions.teamMin1({
        teamAAverageGoalsScored: homeTeamAverageGoalsScored,
        teamBAverageGoalsConceded: awayTeamAverageGoalsConceded,
      }) &&
      sharedFunctions.homeTeamScroreInMostH2HFixtures({
        h2hFixtures: head2HeadMatches,
        homeTeamId: currentFixture.teams.home.id,
        minGoals: 1,
      }) &&
      homeTeamStanding?.rank < awayTeamStanding?.rank
    );
  });
  return {
    fixtures: predictedFixtures,
    option: betOptions.find(
      (option) => option.id === betOptionsEnum.HOME_OVER_O_5
    ) as betOptionModel,
  };
};
