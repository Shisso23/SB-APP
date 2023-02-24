import { betOptionsEnum } from "../enums/bet-options.enums";
import { betOptionModel } from "../models/bet-option-model";
import { FixtureDataModel } from "../models/fixtures";
import { StandingsModel } from "../models/standings-models";
import { betOptions } from "../variables/variables";
import { getLastFiveTeamHomeFixtures, getLastFiveTeamAwayFixtures, getH2HFixtures, teamMinMaxInH2H, againstAwayTeamMinMax, againstHomeTeamMinMax } from "./shared-functions";


export const predict1_2_goals_Away = ({
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
  
      if (lastFiveHomeTeamHomeFixtures.length < 3 || lastFiveAwayTeamAwayFixtures.length<3 || h2hFixtures.length<3) {
        return false;
      }
      return (
       betOptions.find(option=> option.id === betOptionsEnum.AWAY_OVER_0_5).predict({currentFixtures, allFixtures, leaguesStandings}).fixtures.filter(fixture=> fixture.fixture.id === currentFixture.fixture.id).length>0
       && teamMinMaxInH2H({h2hFixtures, maxGoals: 2, teamId: lastFiveAwayTeamAwayFixtures[0].teams.away.id,occurencePercentage: 60}) && againstHomeTeamMinMax({homeTeamFixtures: lastFiveHomeTeamHomeFixtures, maxGoals: 2, occurencePercentage: 50})
      );
    });
    return {
      fixtures: predictedFixtures,
      option: betOptions.find(option => option.id === betOptionsEnum.AWAY_1_2_GOALS) as betOptionModel,
    }; 
  };