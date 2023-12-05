import { betOptionsEnum } from "../enums/bet-options.enums";
import { betOptionModel } from "../models/bet-option-model";
import { FixtureDataModel } from "../models/fixtures";
import { StandingsDataStandingModel, StandingsModel } from "../models/standings-models";
import { betOptions } from "../variables/variables";
import { getLastFiveHomeTeamHomeFixtures, againstAwayTeamGoalsPercentage, homeTeamGoalsPercentage, awayTeamGoalsPercentage, againstHomeTeamGoalsPercentage, homeTeamFailWinningInMostHomeFixtures, awayTeamWinsMostMatchesTimes, otherAwayTeamGoalsInHomeFixtures, homeTeamFailScroringInMostHomeFixtures, getAwayTeamStanding, getHomeTeamStanding, getLastFiveAwayTeamAwayFixtures, goodAwayTeamwinPercentage } from "./shared-functions";

export const predictAwayOrDraw = ({
    currentFixtures,
    allFixtures,
    leaguesStandings,
  }: {
    currentFixtures: FixtureDataModel[];
    allFixtures: FixtureDataModel[];
    leaguesStandings: StandingsModel[];
  }) => {
    const predictedFixtures = currentFixtures.filter(currentFixture => {
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
      if (!homeTeamStanding || !awayTeamStanding ||lastFiveAwayTeamAwayFixtures.length < 3 ||  awayTeamStanding.all.played<3 ) {
        return false;
      }
      //TODO filter the fixtures that passes the H wins either half test here and return it
      return goodAwayTeamwinPercentage({awayStanding: awayTeamStanding, homeStanding: homeTeamStanding, lossPercentage: 75, winPercentage: 45})// away team wins atleast  winPercentage of their games and hometeam loses at least lossPercentage of games
    });
    return {
      fixtures: predictedFixtures,
      option: betOptions.find(option => option.id === betOptionsEnum.AWAY_OR_DRAW) as betOptionModel,
    }; //TODO can look into making that betoption id a enum
  };
  