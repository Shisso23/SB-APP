import { betOptionsEnum } from "../enums/bet-options.enums";
import { betOptionModel } from "../models/bet-option-model";
import { FixtureDataModel } from "../models/fixtures";
import { StandingsDataStandingModel, StandingsModel } from "../models/standings-models";
import { betOptions } from "../variables/variables";
import { getLastFiveTeamHomeFixtures, getLastFiveTeamAwayFixtures, getH2HFixtures, fixtureTotalMinMax, getAwayTeamStanding, getHomeTeamStanding, HomeTeamScroreInMostHomeFixtures, otherHomeTeamGoalsInAwayFixtures, homeTeamGoalsPercentage, againstAwayTeamGoalsPercentage, homeTeamMinGoals, teamMinGoalsInH2H, againstHomeTeamGoalsPercentage, awayTeamGoalsPercentage, otherAwayTeamGoalsInHomeFixtures, awayTeamScroreInMostAwayFixtures, awayTeamMinGoals, homeTeamScroreInMostH2HFixtures, awayTeamScroreInMostH2HFixtures, hasNoNilNilInFixtures } from "./shared-functions";


export const predict3_6_goals = ({
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
       (homeTeamStanding?.rank< awayTeamStanding?.rank ) &&
againstAwayTeamGoalsPercentage({ awayTeamStanding }) >= 130
const isAwayOver0_5 =  awayTeamScroreInMostAwayFixtures({
  awayfixtures: lastFiveAwayTeamAwayFixtures,
  minGoals: 1,
}) &&
otherAwayTeamGoalsInHomeFixtures({
  homeTeamFixtures: lastFiveHomeTeamHomeFixtures,
  goals: 1,
}) &&
awayTeamGoalsPercentage({ awayTeamStanding }) >= 150 &&
  (awayTeamStanding?.rank< homeTeamStanding?.rank ) &&
againstHomeTeamGoalsPercentage({ homeTeamStanding }) >= 130
if (lastFiveHomeTeamHomeFixtures.length < 3 || lastFiveAwayTeamAwayFixtures.length<3 || h2hFixtures.length<3) {
  return false;
}

      const isOver2_5 = homeTeamGoalsPercentage({homeTeamStanding})>= 190 && awayTeamGoalsPercentage({awayTeamStanding})>=190 && homeTeamStanding.all.played>=2 && awayTeamStanding.all.played>=2

  
      return (
      (
        isOver2_5
       && fixtureTotalMinMax({fixtures: lastFiveHomeTeamHomeFixtures, maxGoals: 6, minGoals: 3, occurencePercentage: 60})) ||
       isOver2_5
       && fixtureTotalMinMax({fixtures: lastFiveAwayTeamAwayFixtures, maxGoals: 6, minGoals: 3, occurencePercentage: 60})
      ) && fixtureTotalMinMax({fixtures: h2hFixtures, maxGoals: 6, minGoals: 3, occurencePercentage: 60}) && homeTeamScroreInMostH2HFixtures({h2hFixtures: h2hFixtures, homeTeamId: lastFiveHomeTeamHomeFixtures[0].teams.home.id, minGoals: 1})
      && awayTeamScroreInMostH2HFixtures({h2hFixtures: h2hFixtures, awayTeamId: lastFiveAwayTeamAwayFixtures[0].teams.away.id, minGoals: 1})  && hasNoNilNilInFixtures({fixtures: h2hFixtures})
      && hasNoNilNilInFixtures({fixtures: lastFiveHomeTeamHomeFixtures})  && hasNoNilNilInFixtures({fixtures: lastFiveAwayTeamAwayFixtures});
    });
    return {
      fixtures: predictedFixtures,
      option: betOptions.find(option => option.id === betOptionsEnum.TOTAL_3_6_GOALS) as betOptionModel,
    }; 
  };