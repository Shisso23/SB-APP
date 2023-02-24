import { betOptionsEnum } from "../enums/bet-options.enums";
import { betOptionModel } from "../models/bet-option-model";
import { FixtureDataModel } from "../models/fixtures";
import { StandingsModel } from "../models/standings-models";
import { betOptions } from "../variables/variables";
import { getLastFiveTeamHomeFixtures, homeTeamMinGoals, getH2HFixtures, teamMinGoalsInH2H } from "./shared-functions";


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
      const h2hFixtures = getH2HFixtures({
        teamOneId: currentFixture.teams.home.id,
        teamTwoId: currentFixture.teams.away.id,
        allFixtures,
      });
      if (lastFiveHomeTeamHomeFixtures.length < 3 || h2hFixtures.length) {
        return false;
      }
      return (
        betOptions.find(option=> option.id === betOptionsEnum.HOME_OVER_O_5).predict({currentFixtures, allFixtures, leaguesStandings}).fixtures.filter(fixture=> fixture.fixture.id === currentFixture.fixture.id).length>0 &&
        homeTeamMinGoals({homeTeamFixtures: lastFiveHomeTeamHomeFixtures, minGoals:2, occurencePercentage: 60}) && teamMinGoalsInH2H({h2hFixtures, minGoals: 2, teamId: lastFiveHomeTeamHomeFixtures[0].teams.home.id,occurencePercentage: 60})
      );
    });
    return {
      fixtures: predictedFixtures,
      option: betOptions.find(option => option.id === betOptionsEnum.HOME_OVER_1_5) as betOptionModel,
    };
  };