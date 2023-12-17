import { betOptionsEnum } from "../enums/bet-options.enums";
import { betOptionModel } from "../models/bet-option-model";
import { FixtureDataModel } from "../models/fixtures";
import { StandingsDataStandingModel, StandingsModel } from "../models/standings-models";
import { betOptions } from "../variables/variables";
import { getLastFiveHomeTeamHomeFixtures, againstAwayTeamGoalsPercentage, homeTeamGoalsPercentage, awayTeamGoalsPercentage, againstHomeTeamGoalsPercentage, awayTeamWinsMostMatchesTimes, otherAwayTeamGoalsInHomeFixtures, homeTeamFailWinningInMostHomeFixtures, awayTeamScroreInMostAwayFixtures, getAwayTeamStanding, getHomeTeamStanding, getLastFiveAwayTeamAwayFixtures, getH2HFixtures, getLastFiveTeamFixtures, teamDidNotWinLastFixture, homeTeamFailScroringInMostHomeFixtures, teamWonLastFixture, goodAwayTeamwinPercentage } from "./shared-functions";

export const predictAwayWin = ({
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
      const fixtureH2hFixtures = getH2HFixtures({
        teamOneId: currentFixture.teams.home.id,
        teamTwoId: currentFixture.teams.away.id,
        allFixtures,
      });
      const awayTeamStanding: StandingsDataStandingModel = getAwayTeamStanding({
        standings: leaguesStandings,
        awayTeamId: currentFixture.teams.away.id,
        leagueId: currentFixture.league.id,
      });
      const homeTeamStanding: StandingsDataStandingModel = getHomeTeamStanding({
        standings: leaguesStandings,
        homeTeamId: currentFixture.teams.home.id,
        leagueId: currentFixture.league.id,
      });

      const lastAwayTeamMatches = getLastFiveTeamFixtures({allFixtures, teamId: currentFixture.teams.away.id})
      const lastHomeTeamTeamMatches = getLastFiveTeamFixtures({allFixtures, teamId: currentFixture.teams.home.id})
  
      if (!homeTeamStanding || !awayTeamStanding ||lastFiveAwayTeamAwayFixtures.length < 3 ||  awayTeamStanding.all.played<3 ) {
        return false;
      }
      //TODO filter the fixtures that passes the H wins either half test here and return it
      return goodAwayTeamwinPercentage({awayStanding: awayTeamStanding, homeStanding: homeTeamStanding, lossPercentage: 70, winPercentage: 55})// away team wins atleast  winPercentage of their games and hometeam loses at least lossPercentage of games
    });
    return {
      fixtures: predictedFixtures,
      option: betOptions.find(option => option.id === betOptionsEnum.AWAY) as betOptionModel,
    }; //TODO can look into making that betoption id a enum
  };