import { betOptionsEnum } from "../enums/bet-options.enums";
import { betOptionModel } from "../models/bet-option-model";
import { FixtureDataModel } from "../models/fixtures";
import { StandingsDataStandingModel, StandingsModel } from "../models/standings-models";
import { betOptions } from "../variables/variables";
import { getLastFiveTeamHomeFixtures, againstAwayTeamGoalsPercentage, homeTeamGoalsPercentage, awayTeamGoalsPercentage, againstHomeTeamGoalsPercentage, homeTeamWinsMostMatches, otherHomeTeamGoalsInAwayFixtures, awayTeamFailWinningInMostAwayFixtures, HomeTeamScroreInMostHomeFixtures, getAwayTeamStanding, getHomeTeamStanding, getLastFiveTeamAwayFixtures, getH2HFixtures, homeTeamScroreInMostH2HFixtures } from "./shared-functions";

export const predict_home_wins_or_BTTS  = ({
    currentFixtures,
    allFixtures,
    leaguesStandings,
  }: {
    currentFixtures: FixtureDataModel[];
    allFixtures: FixtureDataModel[];
    leaguesStandings: StandingsModel[];
  }) => {
    const predictedFixtures = currentFixtures.filter(currentFixture => {
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
      if (lastFiveHomeTeamHomeFixtures.length >= 3 && (homeTeamStanding.all.played>=3 && awayTeamStanding.all.played>=3)) {
        return (( homeTeamGoalsPercentage({ homeTeamStanding }) >= 160 &&
        awayTeamGoalsPercentage({ awayTeamStanding }) <= 80 &&
        againstAwayTeamGoalsPercentage({ awayTeamStanding }) >= 150
        ) || ((homeTeamGoalsPercentage({homeTeamStanding}) - awayTeamGoalsPercentage({awayTeamStanding})>=100) && (againstHomeTeamGoalsPercentage({homeTeamStanding})- againstAwayTeamGoalsPercentage({awayTeamStanding}) <= -40))) && homeTeamScroreInMostH2HFixtures({h2hFixtures: fixtureH2hFixtures, minGoals: 1, homeTeamId: homeTeamStanding.team.id}); 
      }
      return false;
    });
    return {
      fixtures: predictedFixtures,
      option: betOptions.find(option => option.id === betOptionsEnum.HOME_WINS_OR_BTTS) as betOptionModel,
    }; //TODO can look into making that betoption id a enum
  };