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
  againstAwayTeamGoalsPercentage,
  homeTeamGoalsPercentage,
  awayTeamGoalsPercentage,
  againstHomeTeamGoalsPercentage,
  homeTeamWinsMostMatches,
  awayTeamFailWinningInMostAwayFixtures,
  HomeTeamScroreInMostHomeFixtures,
  getAwayTeamStanding,
  getHomeTeamStanding,
  getLastFiveAwayTeamAwayFixtures,
  getH2HFixtures,
  homeTeamScroreInMostH2HFixtures,
  awayTeamWinsMostMatchesTimes,
  awayTeamScroreInMostH2HFixtures,
} from "./shared-functions";

export const predict_away_wins_or_BTTS = ({
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
    const lastFiveAwayTeamAwayFixtures = getLastFiveAwayTeamAwayFixtures({
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
      lastFiveAwayTeamAwayFixtures.length >= 3 &&
      awayTeamStanding.all.played >= 3 &&
      homeTeamStanding.all.played >= 3
    ) {
      return (
        ((awayTeamGoalsPercentage({ awayTeamStanding }) >= 160 &&
          homeTeamGoalsPercentage({ homeTeamStanding }) <= 80 &&
          againstHomeTeamGoalsPercentage({ homeTeamStanding }) >= 150) ||
          (awayTeamGoalsPercentage({ awayTeamStanding }) -
            homeTeamGoalsPercentage({ homeTeamStanding }) >=
            100 &&
            againstAwayTeamGoalsPercentage({ awayTeamStanding }) -
              againstHomeTeamGoalsPercentage({ homeTeamStanding }) <=
              -40)) &&
        awayTeamScroreInMostH2HFixtures({
          awayTeamId: awayTeamStanding.team.id,
          minGoals: 1,
          h2hFixtures: fixtureH2hFixtures,
        })
      );
    }
    return false;
  });
  return {
    fixtures: predictedFixtures,
    option: betOptions.find(
      (option) => option.id === betOptionsEnum.AWAY_WINS_OR_BTTS
    ) as betOptionModel,
  }; //TODO can look into making that betoption id a enum
};
