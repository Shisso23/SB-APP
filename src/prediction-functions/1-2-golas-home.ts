import { betOptionsEnum } from "../enums/bet-options.enums";
import { betOptionModel } from "../models/bet-option-model";
import { FixtureDataModel } from "../models/fixtures";
import { StandingsDataStandingModel, StandingsModel } from "../models/standings-models";
import { betOptions } from "../variables/variables";
import { getLastFiveHomeTeamHomeFixtures, getLastFiveAwayTeamAwayFixtures, getH2HFixtures, teamMinMaxInH2H, againstAwayTeamMinMax, HomeTeamScroreInMostHomeFixtures, otherHomeTeamGoalsInAwayFixtures, homeTeamGoalsPercentage, againstAwayTeamGoalsPercentage, getAwayTeamStanding, getHomeTeamStanding } from "./shared-functions";


export const predict1_2_goals_Home = ({
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
       (homeTeamStanding?.rank< awayTeamStanding?.rank ) &&
againstAwayTeamGoalsPercentage({ awayTeamStanding }) >= 130
  
      if (lastFiveHomeTeamHomeFixtures.length < 3 || lastFiveAwayTeamAwayFixtures.length<3 || h2hFixtures.length<3) {
        return false;
      }
      return (
        isHomeOver0_5
       && teamMinMaxInH2H({h2hFixtures, maxGoals: 2, teamId: lastFiveHomeTeamHomeFixtures[0]?.teams.home.id,occurencePercentage: 80}) && againstAwayTeamMinMax({awayTeamFixtures: lastFiveAwayTeamAwayFixtures, maxGoals: 2, occurencePercentage: 60})
      );
    });
    return {
      fixtures: predictedFixtures,
      option: betOptions.find(option => option.id === betOptionsEnum.HOME_1_2_GOALS) as betOptionModel,
    }; 
  };