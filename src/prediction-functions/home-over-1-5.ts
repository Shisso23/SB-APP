import { betOptionsEnum } from "../enums/bet-options.enums";
import { betOptionModel } from "../models/bet-option-model";
import { FixtureDataModel } from "../models/fixtures";
import { StandingsDataStandingModel, StandingsModel } from "../models/standings-models";
import { betOptions } from "../variables/variables";
import { getLastFiveTeamHomeFixtures, homeTeamMinGoals, getH2HFixtures, teamMinGoalsInH2H, getAwayTeamStanding, getHomeTeamStanding, HomeTeamScroreInMostHomeFixtures, homeTeamGoalsPercentage, otherHomeTeamGoalsInAwayFixtures, againstAwayTeamGoalsPercentage, getLastFiveTeamAwayFixtures } from "./shared-functions";


export const predictHomeOver1_5 = ({
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
      const h2hFixtures = getH2HFixtures({
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
      const isHomeOver0_5 =   HomeTeamScroreInMostHomeFixtures({
        homefixtures: lastFiveHomeTeamHomeFixtures,
        minGoals: 1,
      }) &&
      otherHomeTeamGoalsInAwayFixtures({
        awayTeamFixtures: lastFiveAwayTeamAwayFixtures,
        goals: 1,
      }) &&
      homeTeamGoalsPercentage({ homeTeamStanding }) >= 150 &&
       (homeTeamStanding.rank< awayTeamStanding.rank ) &&
againstAwayTeamGoalsPercentage({ awayTeamStanding }) >= 130
      if (lastFiveHomeTeamHomeFixtures.length < 3 || h2hFixtures.length) {
        return false;
      }
      return (
       
        isHomeOver0_5 &&
        homeTeamMinGoals({homeTeamFixtures: lastFiveHomeTeamHomeFixtures, minGoals:2, occurencePercentage: 80}) && teamMinGoalsInH2H({h2hFixtures, minGoals: 2, teamId: lastFiveHomeTeamHomeFixtures[0].teams.home.id,occurencePercentage: 60})
      );
    });
    return {
      fixtures: predictedFixtures,
      option: betOptions.find(option => option.id === betOptionsEnum.HOME_OVER_1_5) as betOptionModel,
    };
  };