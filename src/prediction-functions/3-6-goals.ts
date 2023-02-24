import { betOptionsEnum } from "../enums/bet-options.enums";
import { betOptionModel } from "../models/bet-option-model";
import { FixtureDataModel } from "../models/fixtures";
import { StandingsModel } from "../models/standings-models";
import { betOptions } from "../variables/variables";
import { getLastFiveTeamHomeFixtures, getLastFiveTeamAwayFixtures, getH2HFixtures, fixtureTotalMinMax } from "./shared-functions";


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
  
      if (lastFiveHomeTeamHomeFixtures.length < 3 || lastFiveAwayTeamAwayFixtures.length<3 || h2hFixtures.length<3) {
        return false;
      }
      return (
      ( betOptions.find(option=> option.id === betOptionsEnum.HOME_OVER_1_5).predict({currentFixtures, allFixtures, leaguesStandings}).fixtures.filter(fixture=> fixture.fixture.id === currentFixture.fixture.id).length>0
       && fixtureTotalMinMax({fixtures: lastFiveHomeTeamHomeFixtures, maxGoals: 6, minGoals: 3, occurencePercentage: 60})) ||
       betOptions.find(option=> option.id === betOptionsEnum.AWAY_OVER_1_5).predict({currentFixtures, allFixtures, leaguesStandings}).fixtures.filter(fixture=> fixture.fixture.id === currentFixture.fixture.id).length>0
       && fixtureTotalMinMax({fixtures: lastFiveAwayTeamAwayFixtures, maxGoals: 6, minGoals: 3, occurencePercentage: 60})
      ) && fixtureTotalMinMax({fixtures: h2hFixtures, maxGoals: 6, minGoals: 3, occurencePercentage: 60});
    });
    return {
      fixtures: predictedFixtures,
      option: betOptions.find(option => option.id === betOptionsEnum.TOTAL_3_6_GOALS) as betOptionModel,
    }; 
  };