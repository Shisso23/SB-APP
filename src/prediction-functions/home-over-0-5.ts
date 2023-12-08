import { betOptionsEnum } from "../enums/bet-options.enums";
import { betOptionModel } from "../models/bet-option-model";
import { FixtureDataModel } from "../models/fixtures";
import { StandingsDataStandingModel, StandingsModel } from "../models/standings-models";
import { betOptions } from "../variables/variables";
import { getLastFiveHomeTeamHomeFixtures, HomeTeamScroreInMostHomeFixtures, otherHomeTeamGoalsInAwayFixtures, homeTeamGoalsPercentage, againstAwayTeamGoalsPercentage, getAwayTeamStanding, getHomeTeamStanding, getLastFiveAwayTeamAwayFixtures, getH2HFixtures, homeTeamScroreInMostH2HFixtures, hasNoNilNilInFixtures } from "./shared-functions";


export const predictHomeOver0_5 = ({
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
  
      if (lastFiveHomeTeamHomeFixtures.length < 3 || !homeTeamStanding || !awayTeamStanding) {
        return false;
      }
  //     return (
  //       HomeTeamScroreInMostHomeFixtures({
  //         homefixtures: lastFiveHomeTeamHomeFixtures,
  //         minGoals: 1,
  //       }) &&
  //       otherHomeTeamGoalsInAwayFixtures({
  //         awayTeamFixtures: lastFiveAwayTeamAwayFixtures,
  //         goals: 1,
  //       }) &&
  //       homeTeamGoalsPercentage({ homeTeamStanding }) >= 150 &&
  //        (homeTeamStanding?.rank< awayTeamStanding?.rank ) &&
  // againstAwayTeamGoalsPercentage({ awayTeamStanding }) >= 130 
  //     ) && hasNoNilNilInFixtures({fixtures: fixtureH2hFixtures})  && hasNoNilNilInFixtures({fixtures: lastFiveHomeTeamHomeFixtures})
  return homeTeamGoalsPercentage({ homeTeamStanding }) >= 130 && againstAwayTeamGoalsPercentage({awayTeamStanding})>=180
    });
    return {
      fixtures: predictedFixtures,
      option: betOptions.find(option => option.id === betOptionsEnum.HOME_OVER_O_5) as betOptionModel,
    };
  };