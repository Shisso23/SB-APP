import { betOptionModel } from '../models/bet-option-model';
import { FixtureDataModel } from '../models/fixtures';
import {
  StandingsDataStandingModel,
  StandingsModel,
} from '../models/standings-models';
import {
  betOptions,
  numberOfH2HMatchesBack,
  numberOTeamLastFixturesBack,
} from "../variables/variables";

export const predictOver1_5 = ({
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

    if (
      lastFiveHomeTeamHomeFixtures.length < 3 ||
      lastFiveAwayTeamAwayFixtures.length < 3
    ) {
      return false;
    }
    return (
      homeTeamGoalsPercentage({ homeTeamStanding }) >= 160 &&
      awayTeamGoalsPercentage({ awayTeamStanding }) >= 160 &&
      (againstAwayTeamGoalsPercentage({ awayTeamStanding }) >= 110 &&
        againstHomeTeamGoalsPercentage({ homeTeamStanding }) >= 110)
    );
  });
  return {
    fixtures: predictedFixtures,
    option: betOptions.find(option => option.id === 3) as betOptionModel,
  };
};

export const predictOver2_5 = ({
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

    if (
      lastFiveHomeTeamHomeFixtures.length < 3 ||
      lastFiveAwayTeamAwayFixtures.length < 3
    ) {
      return false;
    }
    return (
      homeTeamGoalsPercentage({ homeTeamStanding }) >= 180 &&
      awayTeamGoalsPercentage({ awayTeamStanding }) >= 180 &&
      (againstAwayTeamGoalsPercentage({ awayTeamStanding }) >= 110 &&
        againstHomeTeamGoalsPercentage({ homeTeamStanding }) >= 110)
    );
  });
  return {
    fixtures: predictedFixtures,
    option: betOptions.find(option => option.id === 4) as betOptionModel,
  };
};

export const predictBothTeamsToScore = ({
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
    const homeTeamId =  lastFiveHomeTeamHomeFixtures[0].teams.home.id;
    const awayTeamId= lastFiveAwayTeamAwayFixtures[0].teams.away.id;
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
    if (
      lastFiveHomeTeamHomeFixtures.length < 3 ||
      lastFiveAwayTeamAwayFixtures.length < 3
    ) {
      return false;
    }
    return (
      (awayTeamScroreInMostAwayFixtures({
        awayfixtures: lastFiveAwayTeamAwayFixtures,
        minGoals: 1,
      }) &&
      otherAwayTeamGoalsInHomeFixtures({
        homeTeamFixtures: lastFiveHomeTeamHomeFixtures,
        goals: 1,
      }) &&
      HomeTeamScroreInMostHomeFixtures({
        homefixtures: lastFiveHomeTeamHomeFixtures,
        minGoals: 1,
      }) &&
      otherHomeTeamGoalsInAwayFixtures({
        awayTeamFixtures: lastFiveAwayTeamAwayFixtures,
        goals: 1,
      }) &&
      homeTeamGoalsPercentage({ homeTeamStanding }) >= 150 &&
      awayTeamGoalsPercentage({ awayTeamStanding }) >= 150 &&
      againstAwayTeamGoalsPercentage({ awayTeamStanding }) >= 120 &&
      againstHomeTeamGoalsPercentage({ homeTeamStanding }) >= 120) || 
      ((( HomeTeamScroreInMostHomeFixtures({
        homefixtures: lastFiveHomeTeamHomeFixtures,
        minGoals: 1,
      }) &&
      otherHomeTeamGoalsInAwayFixtures({
        awayTeamFixtures: lastFiveAwayTeamAwayFixtures,
        goals: 1,
      }) &&
      homeTeamGoalsPercentage({ homeTeamStanding }) >= 150 &&
      againstAwayTeamGoalsPercentage({ awayTeamStanding }) >= 120) && awayTeamScroreInMostH2HFixtures({awayTeamId: awayTeamId, minGoals: 1, h2hFixtures: getH2HFixtures({teamOneId: homeTeamId, teamTwoId: awayTeamId, allFixtures})}) && awayTeamGoalsPercentage({ awayTeamStanding }) >= 150 && againstHomeTeamGoalsPercentage({homeTeamStanding})>=120) || 
      (
        (awayTeamScroreInMostAwayFixtures({
          awayfixtures: lastFiveAwayTeamAwayFixtures,
          minGoals: 1,
        }) &&
        otherAwayTeamGoalsInHomeFixtures({
          homeTeamFixtures: lastFiveHomeTeamHomeFixtures,
          goals: 1,
        }) &&
        awayTeamGoalsPercentage({ awayTeamStanding }) >= 150 &&
        againstHomeTeamGoalsPercentage({ homeTeamStanding }) >= 120) && homeTeamScroreInMostH2HFixtures({homeTeamId: homeTeamId, minGoals: 1, h2hFixtures: getH2HFixtures({teamOneId: homeTeamId, teamTwoId: awayTeamId, allFixtures})}) && homeTeamGoalsPercentage({ homeTeamStanding }) >= 150 && againstAwayTeamGoalsPercentage({awayTeamStanding})>=120
      )
      )
    );
  });
  return {
    fixtures: predictedFixtures,
    option: betOptions.find(option => option.id === 0) as betOptionModel,
  };
};

export const predictHomeWinsEitherHalf = ({
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
    if (lastFiveHomeTeamHomeFixtures.length >= 3) {
      return (
        ((homeTeamWinsMostMatches({
          fixtures: lastFiveHomeTeamHomeFixtures,
          homeTeamId: currentFixture.teams.home.id,
        }) &&
          otherHomeTeamGoalsInAwayFixtures({
            awayTeamFixtures: lastFiveAwayTeamAwayFixtures,
            goals: 1,
          }) &&
          awayTeamFailWinningInMostAwayFixtures({
            awayFixtures: lastFiveAwayTeamAwayFixtures,
          }) &&
          homeTeamGoalsPercentage({ homeTeamStanding }) >= 160 &&
          againstAwayTeamGoalsPercentage({ awayTeamStanding }) >= 140) ||
          (homeTeamGoalsPercentage({ homeTeamStanding }) >= 160 &&
            awayTeamGoalsPercentage({ awayTeamStanding }) <= 80 &&
            againstAwayTeamGoalsPercentage({ awayTeamStanding }) >= 150)) &&
        HomeTeamScroreInMostHomeFixtures({
          homefixtures: lastFiveHomeTeamHomeFixtures,
          minGoals: 1,
        }) &&
        otherHomeTeamGoalsInAwayFixtures({
          awayTeamFixtures: lastFiveAwayTeamAwayFixtures,
          goals: 1,
        }) &&
        homeTeamGoalsPercentage({ homeTeamStanding }) >= 150 &&
        againstAwayTeamGoalsPercentage({ awayTeamStanding }) >= 110 &&
        againstHomeTeamGoalsPercentage({ homeTeamStanding }) <= 150
      );
    }
    return false;
  });

  return {
    fixtures: predictedFixtures,
    option: betOptions.find(option => option.id === 5) as betOptionModel,
  }; //TODO can look into making that betoption a enum
};

export const predictAwayWinsEitherHalf = ({
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
    if (lastFiveHomeTeamHomeFixtures.length >= 3) {
      return (
        ((awayTeamWinsMostMatchesTimes({
          fixtures: lastFiveAwayTeamAwayFixtures,
          awayTeamId: currentFixture.teams.away.id,
        }) &&
          otherAwayTeamGoalsInHomeFixtures({
            homeTeamFixtures: lastFiveHomeTeamHomeFixtures,
            goals: 1,
          }) &&
          homeTeamFailWinningInMostHomeFixtures({
            homefixtures: lastFiveHomeTeamHomeFixtures,
          }) &&
          awayTeamGoalsPercentage({ awayTeamStanding }) >= 160 &&
          againstHomeTeamGoalsPercentage({ homeTeamStanding }) >= 150) ||
          (awayTeamGoalsPercentage({ awayTeamStanding }) >= 160 &&
            homeTeamGoalsPercentage({ homeTeamStanding }) <= 80 &&
            againstHomeTeamGoalsPercentage({ homeTeamStanding }) >= 150)) &&
        awayTeamScroreInMostAwayFixtures({
          awayfixtures: lastFiveAwayTeamAwayFixtures,
          minGoals: 1,
        }) &&
        otherAwayTeamGoalsInHomeFixtures({
          homeTeamFixtures: lastFiveHomeTeamHomeFixtures,
          goals: 1,
        }) &&
        awayTeamGoalsPercentage({ awayTeamStanding }) >= 150 &&
        againstHomeTeamGoalsPercentage({ homeTeamStanding }) >= 110 &&
        againstAwayTeamGoalsPercentage({ awayTeamStanding }) <= 150
      );
    }
    return false;
  });

  return {
    fixtures: predictedFixtures,
    option: betOptions.find(option => option.id === 14) as betOptionModel,
  }; //TODO can look into making that betoption id a enum
};

export const predictHomeWin = ({
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
    if (lastFiveHomeTeamHomeFixtures.length >= 3) {
      return (
        ((homeTeamWinsMostMatches({
          fixtures: lastFiveHomeTeamHomeFixtures,
          homeTeamId: currentFixture.teams.home.id,
        }) &&
          otherHomeTeamGoalsInAwayFixtures({
            awayTeamFixtures: lastFiveAwayTeamAwayFixtures,
            goals: 1,
          }) &&
          awayTeamFailWinningInMostAwayFixtures({
            awayFixtures: lastFiveAwayTeamAwayFixtures,
          }) &&
          homeTeamGoalsPercentage({ homeTeamStanding }) >= 160 &&
          againstAwayTeamGoalsPercentage({ awayTeamStanding }) >= 150) ||
          (homeTeamGoalsPercentage({ homeTeamStanding }) >= 160 &&
            awayTeamGoalsPercentage({ awayTeamStanding }) <= 80 &&
            againstAwayTeamGoalsPercentage({ awayTeamStanding }) >= 150)) &&
        HomeTeamScroreInMostHomeFixtures({
          homefixtures: lastFiveHomeTeamHomeFixtures,
          minGoals: 1,
        }) &&
        otherHomeTeamGoalsInAwayFixtures({
          awayTeamFixtures: lastFiveAwayTeamAwayFixtures,
          goals: 1,
        }) &&
        homeTeamGoalsPercentage({ homeTeamStanding }) >= 150 &&
        againstAwayTeamGoalsPercentage({ awayTeamStanding }) >= 110 &&
        againstHomeTeamGoalsPercentage({ homeTeamStanding }) <= 150
      );
    }
    return false;
  });
  return {
    fixtures: predictedFixtures,
    option: betOptions.find(option => option.id === 1) as betOptionModel,
  }; //TODO can look into making that betoption id a enum
};

export const predictHomeOrDraw = ({
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
    if (
      lastFiveHomeTeamHomeFixtures.length >= 3 &&
      lastFiveAwayTeamAwayFixtures.length >= 3
    ) {
      return (
        ((lastFiveHomeTeamHomeFixtures.every(
          fixtureData => fixtureData.teams.home.winner !== false,
        ) &&
          againstHomeTeamGoalsPercentage({ homeTeamStanding }) <= 150 &&
          awayTeamFailWinningInMostAwayFixtures({
            awayFixtures: lastFiveAwayTeamAwayFixtures,
          }) &&
          awayTeamGoalsPercentage({ awayTeamStanding }) <= 80) ||
          (homeTeamWinsMostMatches({
            fixtures: lastFiveHomeTeamHomeFixtures,
            homeTeamId: currentFixture.teams.home.id,
          }) &&
            otherHomeTeamGoalsInAwayFixtures({
              awayTeamFixtures: lastFiveAwayTeamAwayFixtures,
              goals: 1,
            }) &&
            awayTeamFailWinningInMostAwayFixtures({
              awayFixtures: lastFiveAwayTeamAwayFixtures,
            }) &&
            homeTeamGoalsPercentage({ homeTeamStanding }) >= 160 &&
            againstAwayTeamGoalsPercentage({ awayTeamStanding }) >= 150) ||
          (homeTeamGoalsPercentage({ homeTeamStanding }) >= 160 &&
            awayTeamGoalsPercentage({ awayTeamStanding }) <= 80 &&
            againstAwayTeamGoalsPercentage({ awayTeamStanding }) >= 150)) &&
        againstHomeTeamGoalsPercentage({ homeTeamStanding }) <= 150
      );
    }
    return false;
  });
  return {
    fixtures: predictedFixtures,
    option: betOptions.find(option => option.id === 26) as betOptionModel,
  }; //TODO can look into making that betoption id a enum
};

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
    const lastFiveHomeTeamHomeFixtures = getLastFiveTeamHomeFixtures({
      teamId: currentFixture.teams.home.id,
      allFixtures,
    });
    const lastFiveAwayTeamAwayFixtures = getLastFiveTeamAwayFixtures({
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

    if (lastFiveAwayTeamAwayFixtures.length < 3) {
      return false;
    }
    //TODO filter the fixtures that passes the H wins either half test here and return it
    return (
      ((awayTeamWinsMostMatchesTimes({
        fixtures: lastFiveAwayTeamAwayFixtures,
        awayTeamId: currentFixture.teams.away.id,
      }) &&
        otherAwayTeamGoalsInHomeFixtures({
          homeTeamFixtures: lastFiveHomeTeamHomeFixtures,
          goals: 1,
        }) &&
        homeTeamFailWinningInMostHomeFixtures({
          homefixtures: lastFiveHomeTeamHomeFixtures,
        }) &&
        awayTeamGoalsPercentage({ awayTeamStanding }) >= 160 &&
        againstHomeTeamGoalsPercentage({ homeTeamStanding }) >= 150) ||
        (awayTeamGoalsPercentage({ awayTeamStanding }) >= 160 &&
          homeTeamGoalsPercentage({ homeTeamStanding }) <= 80 &&
          againstHomeTeamGoalsPercentage({ homeTeamStanding }) >= 150)) &&
      awayTeamScroreInMostAwayFixtures({
        awayfixtures: lastFiveAwayTeamAwayFixtures,
        minGoals: 1,
      }) &&
      otherAwayTeamGoalsInHomeFixtures({
        homeTeamFixtures: lastFiveHomeTeamHomeFixtures,
        goals: 1,
      }) &&
      awayTeamGoalsPercentage({ awayTeamStanding }) >= 150 &&
      againstHomeTeamGoalsPercentage({ homeTeamStanding }) >= 110 &&
      againstAwayTeamGoalsPercentage({ awayTeamStanding }) <= 150
    );
  });
  return {
    fixtures: predictedFixtures,
    option: betOptions.find(option => option.id === 12) as betOptionModel,
  }; //TODO can look into making that betoption id a enum
};

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
    const lastFiveHomeTeamHomeFixtures = getLastFiveTeamHomeFixtures({
      teamId: currentFixture.teams.home.id,
      allFixtures,
    });
    const lastFiveAwayTeamAwayFixtures = getLastFiveTeamAwayFixtures({
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
    if (
      lastFiveHomeTeamHomeFixtures.length >= 3 &&
      lastFiveAwayTeamAwayFixtures.length >= 3
    ) {
      return (
        ((lastFiveAwayTeamAwayFixtures.every(
          fixtureData => fixtureData.teams.away.winner !== false,
        ) &&
          againstAwayTeamGoalsPercentage({ awayTeamStanding }) <= 150 &&
          homeTeamFailWinningInMostHomeFixtures({
            homefixtures: lastFiveHomeTeamHomeFixtures,
          }) &&
          homeTeamGoalsPercentage({ homeTeamStanding }) <= 80) ||
          (awayTeamWinsMostMatchesTimes({
            fixtures: lastFiveAwayTeamAwayFixtures,
            awayTeamId: currentFixture.teams.away.id,
          }) &&
            otherAwayTeamGoalsInHomeFixtures({
              homeTeamFixtures: lastFiveHomeTeamHomeFixtures,
              goals: 1,
            }) &&
            homeTeamFailWinningInMostHomeFixtures({
              homefixtures: lastFiveHomeTeamHomeFixtures,
            }) &&
            awayTeamGoalsPercentage({ awayTeamStanding }) >= 160 &&
            againstHomeTeamGoalsPercentage({ homeTeamStanding }) >= 150) ||
          (awayTeamGoalsPercentage({ awayTeamStanding }) >= 160 &&
            homeTeamGoalsPercentage({ homeTeamStanding }) <= 80 &&
            againstHomeTeamGoalsPercentage({ homeTeamStanding }) >= 150)) &&
        againstAwayTeamGoalsPercentage({ awayTeamStanding }) <= 150
      );
    }
    return false;
  });
  return {
    fixtures: predictedFixtures,
    option: betOptions.find(option => option.id === 27) as betOptionModel,
  }; //TODO can look into making that betoption id a enum
};

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
    if (lastFiveHomeTeamHomeFixtures.length < 3) {
      return false;
    }
    return (
      HomeTeamScroreInMostHomeFixtures({
        homefixtures: lastFiveHomeTeamHomeFixtures,
        minGoals: 2,
      }) &&
      otherHomeTeamGoalsInAwayFixtures({
        awayTeamFixtures: lastFiveAwayTeamAwayFixtures,
        goals: 1,
      }) &&
      homeTeamGoalsPercentage({ homeTeamStanding }) >= 180 &&
      againstAwayTeamGoalsPercentage({ awayTeamStanding }) >= 170
    );
  });
  return {
    fixtures: predictedFixtures,
    option: betOptions.find(option => option.id === 2) as betOptionModel,
  }; //TODO can look into making that betoption id a enum
};
// export const predictMultiGoals2_5 = ({
//   currentFixtures,
//   allFixtures,
//   leaguesStandings,
// }: {
//   currentFixtures: FixtureDataModel[];
//   allFixtures: FixtureDataModel[];
//   leaguesStandings: StandingsModel[];
// }) => {
//   const predictedFixtures = currentFixtures.filter((currentFixture) => {
//     const lastFiveHomeTeamHomeFixtures = getLastFiveTeamHomeFixtures({
//       teamId: currentFixture.teams.home.id,
//       allFixtures,
//     });
//     const lastFiveAwayTeamAwayFixtures = getLastFiveTeamAwayFixtures({
//       teamId: currentFixture.teams.away.id,
//       allFixtures,
//     });
//     const fixtureH2hFixtures = getH2HFixtures({
//       teamOneId: currentFixture.teams.home.id,
//       teamTwoId: currentFixture.teams.away.id,
//       allFixtures,
//     });
//     const homeTeamStanding: StandingsDataStandingModel = getHomeTeamStanding({
//       standings: leaguesStandings,
//       homeTeamId: currentFixture.teams.home.id,
//       leagueId: currentFixture.league.id,
//     });
//     const awayTeamStanding: StandingsDataStandingModel = getAwayTeamStanding({
//       standings: leaguesStandings,
//       awayTeamId: currentFixture.teams.away.id,
//       leagueId: currentFixture.league.id,
//     });
//     if (
//       lastFiveHomeTeamHomeFixtures.length < 3 ||
//       lastFiveAwayTeamAwayFixtures.length < 3 ||
//       fixtureH2hFixtures.length < 3
//     ) {
//       return false;
//     }
//     return (
//       fixtureH2hFixtures.every(
//         (fixtureData) =>
//           fixtureData.goals.home + fixtureData.goals.away >= 2 &&
//           fixtureData.goals.home + fixtureData.goals.away <= 5
//       ) &&
//       fixtureH2hFixtures.length >= 2 &&
//       homeTeamGoalsPercentage({ homeTeamStanding }) >= 120 &&
//       awayTeamGoalsPercentage({ awayTeamStanding }) >= 120
//     );
//   });
//   return {
//     fixtures: predictedFixtures,
//     option: betOptions.find((option) => option.id === 6) as betOptionModel,
//   }; // can look into making that betoption a enum
// };

// export const predictMultiGoals3_6 = ({
//   currentFixtures,
//   allFixtures,
//   leaguesStandings,
// }: {
//   currentFixtures: FixtureDataModel[];
//   allFixtures: FixtureDataModel[];
//   leaguesStandings: StandingsModel[];
// }) => {
//   const predictedFixtures = currentFixtures.filter((currentFixture) => {
//     const lastFiveHomeTeamHomeFixtures = getLastFiveTeamHomeFixtures({
//       teamId: currentFixture.teams.home.id,
//       allFixtures,
//     });
//     const lastFiveAwayTeamAwayFixtures = getLastFiveTeamAwayFixtures({
//       teamId: currentFixture.teams.away.id,
//       allFixtures,
//     });
//     const homeTeamStanding: StandingsDataStandingModel = getHomeTeamStanding({
//       standings: leaguesStandings,
//       homeTeamId: currentFixture.teams.home.id,
//       leagueId: currentFixture.league.id,
//     });
//     const awayTeamStanding: StandingsDataStandingModel = getAwayTeamStanding({
//       standings: leaguesStandings,
//       awayTeamId: currentFixture.teams.away.id,
//       leagueId: currentFixture.league.id,
//     });
//     const fixtureH2hFixtures = getH2HFixtures({
//       teamOneId: currentFixture.teams.home.id,
//       teamTwoId: currentFixture.teams.away.id,
//       allFixtures,
//     });
//     if (
//       lastFiveHomeTeamHomeFixtures.length < 3 ||
//       lastFiveAwayTeamAwayFixtures.length < 3 ||
//       fixtureH2hFixtures.length < 3
//     ) {
//       return false;
//     }
//     return (
//       homeTeamGoalsPercentage({ homeTeamStanding }) >= 150 &&
//       awayTeamGoalsPercentage({ awayTeamStanding }) >= 150 &&
//       (againstAwayTeamGoalsPercentage({ awayTeamStanding }) >= 120 ||
//         againstHomeTeamGoalsPercentage({ homeTeamStanding }) >= 120)
//     );
//   });
//   return {
//     fixtures: predictedFixtures,
//     option: betOptions.find((option) => option.id === 7) as betOptionModel,
//   }; // can look into making that betoption a enum
// };

// export const predictBothHalVOver0_5 = ({
//   currentFixtures,
//   allFixtures,
//   leaguesStandings,
// }: {
//   currentFixtures: FixtureDataModel[];
//   allFixtures: FixtureDataModel[];
//   leaguesStandings: StandingsModel[];
// }) => {
//   const predictedFixtures = currentFixtures.filter((currentFixture) => {
//     const lastFiveHomeTeamHomeFixtures = getLastFiveTeamHomeFixtures({
//       teamId: currentFixture.teams.home.id,
//       allFixtures,
//     });
//     const lastFiveAwayTeamAwayFixtures = getLastFiveTeamAwayFixtures({
//       teamId: currentFixture.teams.away.id,
//       allFixtures,
//     });
//     const fixtureH2hFixtures = getH2HFixtures({
//       teamOneId: currentFixture.teams.home.id,
//       teamTwoId: currentFixture.teams.away.id,
//       allFixtures,
//     });
//     const homeTeamStanding: StandingsDataStandingModel = getHomeTeamStanding({
//       standings: leaguesStandings,
//       homeTeamId: currentFixture.teams.home.id,
//       leagueId: currentFixture.league.id,
//     });
//     const awayTeamStanding: StandingsDataStandingModel = getAwayTeamStanding({
//       standings: leaguesStandings,
//       awayTeamId: currentFixture.teams.away.id,
//       leagueId: currentFixture.league.id,
//     });

//     if (
//       lastFiveHomeTeamHomeFixtures.length < 3 ||
//       lastFiveAwayTeamAwayFixtures.length < 3
//     ) {
//       return false;
//     }
//     return (
//       homeTeamGoalsPercentage({ homeTeamStanding }) >= 150 &&
//       awayTeamGoalsPercentage({ awayTeamStanding }) >= 150 &&
//       (againstAwayTeamGoalsPercentage({ awayTeamStanding }) >= 120 ||
//         againstHomeTeamGoalsPercentage({ homeTeamStanding }) >= 120)
//     );
//   });
//   return {
//     fixtures: predictedFixtures,
//     option: betOptions.find((option) => option.id === 8) as betOptionModel,
//   }; // can look into making that betoption a enum
// };

// export const predictDrawOrGoal = ({
//   currentFixtures,
//   allFixtures,
//   leaguesStandings,
// }: {
//   currentFixtures: FixtureDataModel[];
//   allFixtures: FixtureDataModel[];
//   leaguesStandings: StandingsModel[];
// }) => {
//   const predictedFixtures = currentFixtures.filter((currentFixture) => {
//     const lastFiveHomeTeamHomeFixtures = getLastFiveTeamHomeFixtures({
//       teamId: currentFixture.teams.home.id,
//       allFixtures,
//     });
//     const lastFiveAwayTeamAwayFixtures = getLastFiveTeamAwayFixtures({
//       teamId: currentFixture.teams.away.id,
//       allFixtures,
//     });
//     const fixtureH2hFixtures = getH2HFixtures({
//       teamOneId: currentFixture.teams.home.id,
//       teamTwoId: currentFixture.teams.away.id,
//       allFixtures,
//     });

//     if (
//       lastFiveHomeTeamHomeFixtures.length < 3 ||
//       lastFiveAwayTeamAwayFixtures.length < 3
//     ) {
//       return false;
//     }
//     return (
//       awayTeamScroreInMostAwayFixtures({
//         awayfixtures: lastFiveAwayTeamAwayFixtures,
//         minGoals: 1,
//       }) &&
//       otherAwayTeamGoalsInHomeFixtures({
//         homeTeamFixtures: lastFiveHomeTeamHomeFixtures,
//         goals: 1,
//       }) &&
//       HomeTeamScroreInMostHomeFixtures({
//         homefixtures: lastFiveHomeTeamHomeFixtures,
//         minGoals: 1,
//       }) &&
//       otherHomeTeamGoalsInAwayFixtures({
//         awayTeamFixtures: lastFiveAwayTeamAwayFixtures,
//         goals: 1,
//       }) &&
//       homeTeamScroreInMostH2HFixtures({
//         h2hFixtures: fixtureH2hFixtures,
//         homeTeamId: currentFixture.teams.home.id,
//         minGoals: 1,
//       }) &&
//       awayTeamScroreInMostH2HFixtures({
//         h2hFixtures: fixtureH2hFixtures,
//         awayTeamId: currentFixture.teams.away.id,
//         minGoals: 1,
//       }) &&
//       fixtureH2hFixtures.length >= 2
//     );
//   });
//   return {
//     fixtures: predictedFixtures,
//     option: betOptions.find((option) => option.id === 9) as betOptionModel,
//   }; // can look into making that betoption a enum
// };

export const predictDraw = ({
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

    if (
      fixtureH2hFixtures.length < 2 ||
      lastFiveAwayTeamAwayFixtures.length < 3 ||
      lastFiveHomeTeamHomeFixtures.length < 3
    ) {
      return false;
    }
    return (
      (homeTeamStanding?.all.draw / homeTeamStanding?.all.played >= 0.45 &&
        awayTeamStanding?.all.draw / awayTeamStanding?.all.played >= 0.45 &&
        homeTeamGoalsPercentage({ homeTeamStanding }) <= 120 &&
        awayTeamGoalsPercentage({ awayTeamStanding }) <= 120) || (
        homeTeamStanding.all.draw > homeTeamStanding.all.lose && awayTeamStanding.all.draw > awayTeamStanding.all.lose && againstHomeTeamGoalsPercentage({ homeTeamStanding }) < 95 && againstAwayTeamGoalsPercentage({ awayTeamStanding }) < 95
      )
    );
  });
  return {
    fixtures: predictedFixtures,
    option: betOptions.find(option => option.id === 10) as betOptionModel,
  }; // can look into making that betoption a enum
};

// export const predictHTDraw = ({
//   currentFixtures,
//   allFixtures,
//   leaguesStandings,
// }: {
//   currentFixtures: FixtureDataModel[];
//   allFixtures: FixtureDataModel[];
//   leaguesStandings: StandingsModel[];
// }) => {
//   const predictedFixtures = currentFixtures.filter((currentFixture) => {
//     const lastFiveHomeTeamHomeFixtures = getLastFiveTeamHomeFixtures({
//       teamId: currentFixture.teams.home.id,
//       allFixtures,
//     });
//     const lastFiveAwayTeamAwayFixtures = getLastFiveTeamAwayFixtures({
//       teamId: currentFixture.teams.away.id,
//       allFixtures,
//     });
//     const fixtureH2hFixtures = getH2HFixtures({
//       teamOneId: currentFixture.teams.home.id,
//       teamTwoId: currentFixture.teams.away.id,
//       allFixtures,
//     });
//     if (
//       fixtureH2hFixtures.length < 2 ||
//       lastFiveAwayTeamAwayFixtures.length < 3 ||
//       lastFiveHomeTeamHomeFixtures.length < 3
//     ) {
//       return false;
//     }
//     return (
//       (homeTeamDrawMostFixtures({
//         fixtures: fixtureH2hFixtures,
//         homeTeamId: currentFixture.teams.home.id,
//       }) &&
//         awayTeamDrawMostFixtures({
//           fixtures: fixtureH2hFixtures,
//           awayTeamId: currentFixture.teams.away.id,
//         })) ||
//       (homeTeamFailScroringInMostHomeFixtures({
//         homefixtures: lastFiveHomeTeamHomeFixtures,
//       }) &&
//         awayTeamFailScroringInMostAwayFixtures({
//           awayfixtures: lastFiveAwayTeamAwayFixtures,
//         })) ||
//       (lastFiveHomeTeamHomeFixtures.every(
//         (fixtureData) => fixtureData.teams.home.winner !== false
//       ) &&
//         lastFiveAwayTeamAwayFixtures.every(
//           (fixtureData) => fixtureData.teams.away.winner !== false
//         ))
//     );
//   });
//   return {
//     fixtures: predictedFixtures,
//     option: betOptions.find((option) => option.id === 11) as betOptionModel,
//   }; // can look into making that betoption a enum
// };

export const predictAwayOver1_5 = ({
  currentFixtures,
  allFixtures,
  leaguesStandings,
}: {
  currentFixtures: FixtureDataModel[];
  allFixtures: FixtureDataModel[];
  leaguesStandings: StandingsModel[];
}) => {
  const predictedFixtures = currentFixtures.filter(currentFixture => {
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
    const lastFiveHomeTeamHomeFixtures = getLastFiveTeamHomeFixtures({
      teamId: currentFixture.teams.home.id,
      allFixtures,
    });
    const lastFiveAwayTeamAwayFixtures = getLastFiveTeamAwayFixtures({
      teamId: currentFixture.teams.away.id,
      allFixtures,
    });
    if (lastFiveAwayTeamAwayFixtures.length < 3) {
      return false;
    }
    return (
      awayTeamScroreInMostAwayFixtures({
        awayfixtures: lastFiveAwayTeamAwayFixtures,
        minGoals: 2,
      }) &&
      otherAwayTeamGoalsInHomeFixtures({
        homeTeamFixtures: lastFiveHomeTeamHomeFixtures,
        goals: 1,
      }) &&
      awayTeamGoalsPercentage({ awayTeamStanding }) >= 180 &&
      againstHomeTeamGoalsPercentage({ homeTeamStanding }) >= 170
    );
  });
  return {
    fixtures: predictedFixtures,
    option: betOptions.find(option => option.id === 13) as betOptionModel,
  }; // can look into making that betoption a enum
};

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
    const lastFiveHomeTeamHomeFixtures = getLastFiveTeamHomeFixtures({
      teamId: currentFixture.teams.home.id,
      allFixtures,
    });
    const lastFiveAwayTeamAwayFixtures = getLastFiveTeamAwayFixtures({
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

    if (lastFiveHomeTeamHomeFixtures.length < 3) {
      return false;
    }
    return (
      HomeTeamScroreInMostHomeFixtures({
        homefixtures: lastFiveHomeTeamHomeFixtures,
        minGoals: 1,
      }) &&
      otherHomeTeamGoalsInAwayFixtures({
        awayTeamFixtures: lastFiveAwayTeamAwayFixtures,
        goals: 1,
      }) &&
      homeTeamGoalsPercentage({ homeTeamStanding }) >= 150 &&
      againstAwayTeamGoalsPercentage({ awayTeamStanding }) >= 120
    );
  });
  return {
    fixtures: predictedFixtures,
    option: betOptions.find(option => option.id === 15) as betOptionModel,
  }; // can look into making that betoption a enum
};

export const predictAwayOver0_5 = ({
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
    if (lastFiveAwayTeamAwayFixtures.length < 3) {
      return false;
    }
    return (
      awayTeamScroreInMostAwayFixtures({
        awayfixtures: lastFiveAwayTeamAwayFixtures,
        minGoals: 1,
      }) &&
      otherAwayTeamGoalsInHomeFixtures({
        homeTeamFixtures: lastFiveHomeTeamHomeFixtures,
        goals: 1,
      }) &&
      awayTeamGoalsPercentage({ awayTeamStanding }) >= 150 &&
      againstHomeTeamGoalsPercentage({ homeTeamStanding }) >= 120
    );
  });
  return {
    fixtures: predictedFixtures,
    option: betOptions.find(option => option.id === 16) as betOptionModel,
  }; // can look into making that betoption a enum
};

// --- new Prediction functions

// export const predictMultiGoals2_4 = ({
//   currentFixtures,
//   allFixtures,
//   leaguesStandings,
// }: {
//   currentFixtures: FixtureDataModel[];
//   allFixtures: FixtureDataModel[];
//   leaguesStandings: StandingsModel[];
// }) => {
//   const predictedFixtures = currentFixtures.filter((currentFixture) => {
//     const lastFiveHomeTeamHomeFixtures = getLastFiveTeamHomeFixtures({
//       teamId: currentFixture.teams.home.id,
//       allFixtures,
//     });
//     const lastFiveAwayTeamAwayFixtures = getLastFiveTeamAwayFixtures({
//       teamId: currentFixture.teams.away.id,
//       allFixtures,
//     });
//     const homeTeamStanding: StandingsDataStandingModel = getHomeTeamStanding({
//       standings: leaguesStandings,
//       homeTeamId: currentFixture.teams.home.id,
//       leagueId: currentFixture.league.id,
//     });

//     const awayTeamStanding: StandingsDataStandingModel = getAwayTeamStanding({
//       standings: leaguesStandings,
//       awayTeamId: currentFixture.teams.away.id,
//       leagueId: currentFixture.league.id,
//     });
//     const fixtureH2hFixtures = getH2HFixtures({
//       teamOneId: currentFixture.teams.home.id,
//       teamTwoId: currentFixture.teams.away.id,
//       allFixtures,
//     });
//     if (
//       lastFiveAwayTeamAwayFixtures.length < 3 ||
//       lastFiveHomeTeamHomeFixtures.length < 3
//     ) {
//       return false;
//     }
//     return (
//       fixtureH2hFixtures.every(
//         (fixtureData) =>
//           fixtureData.goals.home + fixtureData.goals.away >= 2 &&
//           fixtureData.goals.home + fixtureData.goals.away <= 4
//       ) &&
//       fixtureH2hFixtures.length >= 3 &&
//       homeTeamGoalsPercentage({ homeTeamStanding }) >= 120 &&
//       awayTeamGoalsPercentage({ awayTeamStanding }) >= 120
//     );
//   });
//   return {
//     fixtures: predictedFixtures,
//     option: betOptions.find((option) => option.id === 17) as betOptionModel,
//   }; // can look into making that betoption a enum
// };

export const predictMultiGoals0_2 = ({
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
    if (
      lastFiveAwayTeamAwayFixtures.length < 3 ||
      lastFiveHomeTeamHomeFixtures.length < 3
    ) {
      return false;
    }
    return (
    ( ( homeTeamStanding.all.goals.for/ homeTeamStanding.all.played ) <= 0.85 &&  (awayTeamStanding.all.goals.for/  awayTeamStanding.all.played )<=0.85)||
    againstHomeTeamGoalsPercentage({ homeTeamStanding }) < 85 && againstAwayTeamGoalsPercentage({ awayTeamStanding }) < 85
    );
  });
  return {
    fixtures: predictedFixtures,
    option: betOptions.find(option => option.id === 18) as betOptionModel,
  }; // can look into making that betoption a enum
};

export const predictMultiGoals0_3 = ({
  currentFixtures,
  allFixtures,
  leaguesStandings,
}: {
  currentFixtures: FixtureDataModel[];
  allFixtures: FixtureDataModel[];
  leaguesStandings: StandingsModel[];
}) => {
  const predictedFixtures = currentFixtures.filter((currentFixture) => {
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
    if (
      lastFiveAwayTeamAwayFixtures.length < 3 ||
      lastFiveHomeTeamHomeFixtures.length < 3
    ) {
      return false;
    }
    return (
      ( ( homeTeamStanding.all.goals.for/ homeTeamStanding.all.played ) <= 0.9 &&  (awayTeamStanding.all.goals.for/  awayTeamStanding.all.played )<=0.9)||
      againstHomeTeamGoalsPercentage({ homeTeamStanding }) < 90 && againstAwayTeamGoalsPercentage({ awayTeamStanding }) < 90
    );
  });
  return {
    fixtures: predictedFixtures,
    option: betOptions.find((option) => option.id === 19) as betOptionModel,
  }; // can look into making that betoption a enum
};

export const predictMultiGoals1_2Home = ({
  currentFixtures,
  allFixtures,
  leaguesStandings,
}: {
  currentFixtures: FixtureDataModel[];
  allFixtures: FixtureDataModel[];
  leaguesStandings: StandingsModel[];
}) => {
  const predictedFixtures = currentFixtures.filter(currentFixture => {
    const lastFiveAwayTeamAwayFixtures = getLastFiveTeamAwayFixtures({
      teamId: currentFixture.teams.away.id,
      allFixtures,
    });
    const lastFiveHomeTeamHomeFixtures = getLastFiveTeamHomeFixtures({
      teamId: currentFixture.teams.home.id,
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
    if (lastFiveHomeTeamHomeFixtures.length < 3) {
      return false;
    }
    return (
      HomeTeamScroreInMostHomeFixtures({
        homefixtures: lastFiveHomeTeamHomeFixtures,
        minGoals: 1,
      }) &&
      homeTeamMaxGoals({
        homeTeamFixtures: lastFiveHomeTeamHomeFixtures,
        maxGoals: 2,
      }) &&
      otherHomeTeamGoalsInAwayFixtures({
        awayTeamFixtures: lastFiveAwayTeamAwayFixtures,
        goals: 1,
      }) &&
      homeTeamGoalsPercentage({ homeTeamStanding }) >= 140 &&
      homeTeamGoalsPercentage({ homeTeamStanding }) <= 180 &&
      againstAwayTeamGoalsPercentage({ awayTeamStanding }) >= 110 &&
      againstAwayTeamGoalsPercentage({ awayTeamStanding }) <= 140 &&
      otherHomeTeamMinMaxGoalsInAwayFixtures({
        awayTeamFixtures: lastFiveAwayTeamAwayFixtures,
        minGoals: 1,
        maxGoals: 2,
      })
    );
  });
  return {
    fixtures: predictedFixtures,
    option: betOptions.find(option => option.id === 20) as betOptionModel,
  }; // can look into making that betoption a enum
};

// export const predictMultiGoals1_3Home = ({
//   currentFixtures,
//   allFixtures,
//   leaguesStandings,
// }: {
//   currentFixtures: FixtureDataModel[];
//   allFixtures: FixtureDataModel[];
//   leaguesStandings: StandingsModel[];
// }) => {
//   const predictedFixtures = currentFixtures.filter((currentFixture) => {
//     const lastFiveAwayTeamAwayFixtures = getLastFiveTeamAwayFixtures({
//       teamId: currentFixture.teams.away.id,
//       allFixtures,
//     });
//     const lastFiveHomeTeamHomeFixtures = getLastFiveTeamHomeFixtures({
//       teamId: currentFixture.teams.home.id,
//       allFixtures,
//     });
//     const fixtureH2hFixtures = getH2HFixtures({
//       teamOneId: currentFixture.teams.home.id,
//       teamTwoId: currentFixture.teams.away.id,
//       allFixtures,
//     });
//     const homeTeamStanding: StandingsDataStandingModel = getHomeTeamStanding({
//       standings: leaguesStandings,
//       homeTeamId: currentFixture.teams.home.id,
//       leagueId: currentFixture.league.id,
//     });
//     if (
//       lastFiveHomeTeamHomeFixtures.length < 3 ||
//       fixtureH2hFixtures.length < 2
//     ) {
//       return false;
//     }
//     return (
//       lastFiveHomeTeamHomeFixtures.every(
//         (fixtureData) =>
//           fixtureData.goals.home >= 1 && fixtureData.goals.home <= 2
//       ) &&
//       otherHomeTeamGoalsInAwayFixtures({
//         awayTeamFixtures: lastFiveAwayTeamAwayFixtures,
//         goals: 1,
//       }) &&
//       HomeTeamScroreInMostHomeFixtures({
//         homefixtures: lastFiveHomeTeamHomeFixtures,
//         minGoals: 1,
//       }) &&
//       otherHomeTeamMinMaxGoalsInAwayFixtures({
//         awayTeamFixtures: lastFiveAwayTeamAwayFixtures,
//         minGoals: 1,
//         maxGoals: 2,
//       }) &&
//       homeTeamScroreInMostH2HFixtures({
//         h2hFixtures: fixtureH2hFixtures,
//         homeTeamId: currentFixture.teams.home.id,
//         minGoals: 1,
//       }) &&
//       homeTeamGoalsPercentage({ homeTeamStanding }) >= 120
//     );
//   });
//   return {
//     fixtures: predictedFixtures,
//     option: betOptions.find((option) => option.id === 21) as betOptionModel,
//   }; // can look into making that betoption a enum
// };

export const predictMultiGoals2_3Home = ({
  currentFixtures,
  allFixtures,
  leaguesStandings,
}: {
  currentFixtures: FixtureDataModel[];
  allFixtures: FixtureDataModel[];
  leaguesStandings: StandingsModel[];
}) => {
  const predictedFixtures = currentFixtures.filter(currentFixture => {
    const lastFiveAwayTeamAwayFixtures = getLastFiveTeamAwayFixtures({
      teamId: currentFixture.teams.away.id,
      allFixtures,
    });
    const lastFiveHomeTeamHomeFixtures = getLastFiveTeamHomeFixtures({
      teamId: currentFixture.teams.home.id,
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
    if (
      lastFiveHomeTeamHomeFixtures.length < 3 ||
      fixtureH2hFixtures.length < 2
    ) {
      return false;
    }
    return (
      HomeTeamScroreInMostHomeFixtures({
        homefixtures: lastFiveHomeTeamHomeFixtures,
        minGoals: 2,
      }) &&
      homeTeamMaxGoals({
        homeTeamFixtures: lastFiveHomeTeamHomeFixtures,
        maxGoals: 3,
      }) &&
      otherHomeTeamGoalsInAwayFixtures({
        awayTeamFixtures: lastFiveAwayTeamAwayFixtures,
        goals: 2,
      }) &&
      homeTeamGoalsPercentage({ homeTeamStanding }) >= 160 &&
      homeTeamGoalsPercentage({ homeTeamStanding }) <= 190 &&
      againstAwayTeamGoalsPercentage({ awayTeamStanding }) >= 120 &&
      againstAwayTeamGoalsPercentage({ awayTeamStanding }) <= 160 &&
      otherHomeTeamMinMaxGoalsInAwayFixtures({
        awayTeamFixtures: lastFiveAwayTeamAwayFixtures,
        minGoals: 2,
        maxGoals: 3,
      })
    );
  });
  return {
    fixtures: predictedFixtures,
    option: betOptions.find(option => option.id === 22) as betOptionModel,
  }; // can look into making that betoption a enum
};

export const predictMultiGoals1_2Away = ({
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
    if (
      lastFiveAwayTeamAwayFixtures.length < 3 ||
      fixtureH2hFixtures.length < 2
    ) {
      return false;
    }
    return (
      awayTeamScroreInMostAwayFixtures({
        awayfixtures: lastFiveAwayTeamAwayFixtures,
        minGoals: 1,
      }) &&
      awayTeamMaxGoals({
        awayTeamFixtures: lastFiveAwayTeamAwayFixtures,
        maxGoals: 2,
      }) &&
      otherAwayTeamGoalsInHomeFixtures({
        homeTeamFixtures: lastFiveHomeTeamHomeFixtures,
        goals: 1,
      }) &&
      awayTeamGoalsPercentage({ awayTeamStanding }) >= 140 &&
      awayTeamGoalsPercentage({ awayTeamStanding }) <= 180 &&
      againstHomeTeamGoalsPercentage({ homeTeamStanding }) >= 110 &&
      againstHomeTeamGoalsPercentage({ homeTeamStanding }) <= 140 &&
      otherAwayTeamMinMaxGoalsInHomeFixtures({
        homeTeamFixtures: lastFiveHomeTeamHomeFixtures,
        minGoals: 1,
        maxGoals: 2,
      })
    );
  });
  return {
    fixtures: predictedFixtures,
    option: betOptions.find(option => option.id === 23) as betOptionModel,
  }; // can look into making that betoption a enum
};

export const predictMultiGoals2_3Away = ({
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
    if (
      lastFiveAwayTeamAwayFixtures.length < 3 ||
      fixtureH2hFixtures.length < 2
    ) {
      return false;
    }
    return (
      awayTeamScroreInMostAwayFixtures({
        awayfixtures: lastFiveAwayTeamAwayFixtures,
        minGoals: 2,
      }) &&
      awayTeamMaxGoals({
        awayTeamFixtures: lastFiveAwayTeamAwayFixtures,
        maxGoals: 3,
      }) &&
      otherAwayTeamGoalsInHomeFixtures({
        homeTeamFixtures: lastFiveHomeTeamHomeFixtures,
        goals: 1,
      }) &&
      awayTeamGoalsPercentage({ awayTeamStanding }) >= 160 &&
      awayTeamGoalsPercentage({ awayTeamStanding }) <= 190 &&
      againstHomeTeamGoalsPercentage({ homeTeamStanding }) >= 120 &&
      againstHomeTeamGoalsPercentage({ homeTeamStanding }) <= 160 &&
      otherAwayTeamMinMaxGoalsInHomeFixtures({
        homeTeamFixtures: lastFiveHomeTeamHomeFixtures,
        minGoals: 2,
        maxGoals: 3,
      })
    );
  });
  return {
    fixtures: predictedFixtures,
    option: betOptions.find(option => option.id === 24) as betOptionModel,
  }; // can look into making that betoption a enum
};

// export const predictMultiGoals1_3Away = ({
//   currentFixtures,
//   allFixtures,
//   leaguesStandings,
// }: {
//   currentFixtures: FixtureDataModel[];
//   allFixtures: FixtureDataModel[];
//   leaguesStandings: StandingsModel[];
// }) => {
//   const predictedFixtures = currentFixtures.filter((currentFixture) => {
//     const lastFiveHomeTeamHomeFixtures = getLastFiveTeamHomeFixtures({
//       teamId: currentFixture.teams.home.id,
//       allFixtures,
//     });
//     const lastFiveAwayTeamAwayFixtures = getLastFiveTeamAwayFixtures({
//       teamId: currentFixture.teams.away.id,
//       allFixtures,
//     });
//     const fixtureH2hFixtures = getH2HFixtures({
//       teamOneId: currentFixture.teams.home.id,
//       teamTwoId: currentFixture.teams.away.id,
//       allFixtures,
//     });
//     const awayTeamStanding: StandingsDataStandingModel = getAwayTeamStanding({
//       standings: leaguesStandings,
//       awayTeamId: currentFixture.teams.away.id,
//       leagueId: currentFixture.league.id,
//     });
//     if (
//       lastFiveAwayTeamAwayFixtures.length < 3 ||
//       fixtureH2hFixtures.length < 2
//     ) {
//       return false;
//     }
//     return (
//       ((lastFiveAwayTeamAwayFixtures.every(
//         (fixtureData) =>
//           fixtureData.goals.away >= 1 && fixtureData.goals.away <= 2
//       ) &&
//         otherAwayTeamGoalsInHomeFixtures({
//           homeTeamFixtures: lastFiveHomeTeamHomeFixtures,
//           goals: 1,
//         })) ||
//         (awayTeamScroreInMostAwayFixtures({
//           awayfixtures: lastFiveAwayTeamAwayFixtures,
//           minGoals: 2,
//         }) &&
//           otherAwayTeamMinMaxGoalsInHomeFixtures({
//             homeTeamFixtures: lastFiveHomeTeamHomeFixtures,
//             minGoals: 1,
//             maxGoals: 2,
//           }))) &&
//       awayTeamScroreInMostH2HFixtures({
//         h2hFixtures: fixtureH2hFixtures,
//         awayTeamId: currentFixture.teams.away.id,
//         minGoals: 1,
//       }) &&
//       awayTeamGoalsPercentage({ awayTeamStanding }) >= 120
//     );
//   });
//   return {
//     fixtures: predictedFixtures,
//     option: betOptions.find((option) => option.id === 25) as betOptionModel,
//   }; // can look into making that betoption a enum
// };

export const getLastFiveTeamHomeFixtures = ({
  teamId,
  allFixtures,
}: {
  teamId: number;
  allFixtures: FixtureDataModel[];
}) => {
  return allFixtures
    .filter(fixture => {
      return (
        fixture.teams.home.id === teamId &&
        fixture.fixture.status.short === 'FT'
      );
    })
    .slice(0, numberOTeamLastFixturesBack)
    .sort((fixtureA, fixtureB) => {
      return fixtureB.fixture.timestamp - fixtureA.fixture.timestamp;
    });
};

export const getLastFiveTeamAwayFixtures = ({
  teamId,
  allFixtures,
}: {
  teamId: number;
  allFixtures: FixtureDataModel[];
}) => {
  return allFixtures
    .filter(fixture => {
      return (
        (fixture.teams.away.id === teamId ||
          fixture.teams.away.id === teamId) &&
        fixture.fixture.status.short === 'FT'
      );
    })
    .slice(0, numberOTeamLastFixturesBack)
    .sort((fixtureA, fixtureB) => {
      return fixtureB.fixture.timestamp - fixtureA.fixture.timestamp;
    });
};

export const getH2HFixtures = ({
  teamOneId,
  teamTwoId,
  allFixtures,
}: {
  teamOneId: number;
  teamTwoId: number;
  allFixtures: FixtureDataModel[];
}) => {
  return allFixtures
    .filter(fixture => {
      return (
        (fixture.teams.home.id === teamOneId ||
          fixture.teams.away.id === teamOneId) &&
        (fixture.teams.home.id === teamTwoId ||
          fixture.teams.away.id === teamTwoId) &&
        fixture.fixture.status.short === 'FT'
      );
    })
    .slice(0, numberOfH2HMatchesBack)
    .sort((fixtureA, fixtureB) => {
      return fixtureB.fixture.timestamp - fixtureA.fixture.timestamp;
    }); //TODO verify there's enough h2h
};

export const HomeTeamScroreInMostHomeFixtures = ({
  homefixtures,
  minGoals,
}: {
  homefixtures: FixtureDataModel[];
  minGoals: number;
}) => {
  let conditionPassedCount = 0;
  homefixtures.forEach(fixtureData => {
    if (fixtureData.goals.home >= minGoals) {
      conditionPassedCount += 1;
    }
  });
  if (conditionPassedCount / homefixtures.length >= 0.75) {
    return true;
  } else {
    return false;
  }
};

export const awayTeamScroreInMostAwayFixtures = ({
  awayfixtures,
  minGoals,
}: {
  awayfixtures: FixtureDataModel[];
  minGoals: number;
}) => {
  let conditionPassedCount = 0;
  awayfixtures.forEach(fixtureData => {
    if (fixtureData.goals.away >= minGoals) {
      conditionPassedCount += 1;
    }
  });
  if (conditionPassedCount / awayfixtures.length >= 0.75) {
    return true;
  } else {
    return false;
  }
};

export const awayTeamFailScroringInMostAwayFixtures = ({
  awayfixtures,
}: {
  awayfixtures: FixtureDataModel[];
}) => {
  let conditionPassedCount = 0;
  awayfixtures.forEach(fixtureData => {
    if (fixtureData.goals.away < 1) {
      conditionPassedCount += 1;
    }
  });
  if (conditionPassedCount / awayfixtures.length >= 0.7) {
    return true;
  } else {
    return false;
  }
};

export const homeTeamFailScroringInMostHomeFixtures = ({
  homefixtures,
}: {
  homefixtures: FixtureDataModel[];
}) => {
  let conditionPassedCount = 0;
  homefixtures.forEach(fixtureData => {
    if (fixtureData.goals.home < 1) {
      conditionPassedCount += 1;
    }
  });
  if (conditionPassedCount / homefixtures.length >= 0.7) {
    return true;
  } else {
    return false;
  }
};

export const homeTeamFailWinningInMostHomeFixtures = ({
  homefixtures,
}: {
  homefixtures: FixtureDataModel[];
}) => {
  let conditionPassedCount = 0;
  homefixtures.forEach(fixtureData => {
    if (fixtureData.goals.home <= fixtureData.goals.away) {
      conditionPassedCount += 1;
    }
  });
  if (conditionPassedCount / homefixtures.length >= 0.7) {
    return true;
  } else {
    return false;
  }
};

export const awayTeamFailWinningInMostAwayFixtures = ({
  awayFixtures,
}: {
  awayFixtures: FixtureDataModel[];
}) => {
  let conditionPassedCount = 0;
  awayFixtures.forEach(fixtureData => {
    if (fixtureData.goals.away <= fixtureData.goals.home) {
      conditionPassedCount += 1;
    }
  });
  if (conditionPassedCount / awayFixtures.length >= 0.7) {
    return true;
  } else {
    return false;
  }
};

const homeTeamMaxGoals = ({
  homeTeamFixtures,
  maxGoals,
}: {
  homeTeamFixtures: FixtureDataModel[];
  maxGoals: number;
}) => {
  let count = 0;
  homeTeamFixtures.forEach(fixture => {
    if (fixture.goals.home <= maxGoals) {
      count += 1;
    }
  });
  if (count / homeTeamFixtures.length >= 0.6) {
    return true;
  }
  return false;
};

const awayTeamMaxGoals = ({
  awayTeamFixtures,
  maxGoals,
}: {
  awayTeamFixtures: FixtureDataModel[];
  maxGoals: number;
}) => {
  let count = 0;
  awayTeamFixtures.forEach(fixture => {
    if (fixture.goals.away <= maxGoals) {
      count += 1;
    }
  });
  if (count / awayTeamFixtures.length >= 0.6) {
    return true;
  }
  return false;
};

const otherHomeTeamGoalsInAwayFixtures = ({
  awayTeamFixtures,
  goals,
}: {
  awayTeamFixtures: FixtureDataModel[];
  goals: number;
}) => {
  let conditionPassedCount = 0;
  awayTeamFixtures.forEach(fixtureData => {
    if (fixtureData.goals.home >= goals) {
      conditionPassedCount += 1;
    }
  });
  if (conditionPassedCount / awayTeamFixtures.length >= 0.75) {
    return true;
  } else {
    return false;
  }
};

const otherAwayTeamGoalsInHomeFixtures = ({
  homeTeamFixtures,
  goals,
}: {
  homeTeamFixtures: FixtureDataModel[];
  goals: number;
}) => {
  let conditionPassedCount = 0;
  homeTeamFixtures.forEach(fixtureData => {
    if (fixtureData.goals.away >= goals) {
      conditionPassedCount += 1;
    }
  });
  if (conditionPassedCount / homeTeamFixtures.length >= 0.75) {
    return true;
  } else {
    return false;
  }
};

const otherHomeTeamMinMaxGoalsInAwayFixtures = ({
  awayTeamFixtures,
  minGoals,
  maxGoals,
}: {
  awayTeamFixtures: FixtureDataModel[];
  minGoals: number;
  maxGoals: number;
}) => {
  let conditionPassedCount = 0;
  awayTeamFixtures.forEach(fixtureData => {
    if (
      fixtureData.goals.home >= minGoals &&
      fixtureData.goals.home <= maxGoals
    ) {
      conditionPassedCount += 1;
    }
  });
  if (conditionPassedCount / awayTeamFixtures.length > 0.6) {
    return true;
  } else {
    return false;
  }
};

const otherAwayTeamMinMaxGoalsInHomeFixtures = ({
  homeTeamFixtures,
  minGoals,
  maxGoals,
}: {
  homeTeamFixtures: FixtureDataModel[];
  minGoals: number;
  maxGoals: number;
}) => {
  let conditionPassedCount = 0;
  homeTeamFixtures.forEach(fixtureData => {
    if (
      fixtureData.goals.away >= minGoals &&
      fixtureData.goals.away <= maxGoals
    ) {
      conditionPassedCount += 1;
    }
  });
  if (conditionPassedCount / homeTeamFixtures.length > 0.6) {
    return true;
  } else {
    return false;
  }
};

const homeTeamWinsMostMatches = ({
  fixtures,
  homeTeamId,
}: {
  fixtures: FixtureDataModel[];
  homeTeamId: number;
}) => {
  let conditionPassedCount = 0;
  fixtures.forEach(fixtureData => {
    if (
      (fixtureData.score.fulltime.home > fixtureData.score.fulltime.away &&
        fixtureData.teams.home.id === homeTeamId) ||
      (fixtureData.score.fulltime.away > fixtureData.score.fulltime.home &&
        fixtureData.teams.away.id === homeTeamId)
    ) {
      conditionPassedCount += 1;
    }
  });
  if (conditionPassedCount / fixtures.length > 0.75) {
    return true;
  } else {
    return false;
  }
};
//  return false;
//   }
// };

const awayTeamWinsMostMatchesTimes = ({
  fixtures,
  awayTeamId,
}: {
  fixtures: FixtureDataModel[];
  awayTeamId: number;
}) => {
  let conditionPassedCount = 0;
  fixtures.forEach(fixtureData => {
    if (
      (fixtureData.score.fulltime.home > fixtureData.score.fulltime.away &&
        fixtureData.teams.home.id === awayTeamId) ||
      (fixtureData.score.fulltime.away > fixtureData.score.fulltime.home &&
        fixtureData.teams.away.id === awayTeamId)
    ) {
      conditionPassedCount += 1;
    }
  });
  if (conditionPassedCount / fixtures.length > 0.75) {
    return true;
  } else {
    return false;
  }
};

export const filterByDate = (fixtures: FixtureDataModel[]) =>
  fixtures.sort((fixtureA, fixtureB) => {
    return fixtureA.fixture.timestamp - fixtureB.fixture.timestamp;
  });

export const getHomeTeamStanding = ({
  standings,
  homeTeamId,
  leagueId,
}: {
  standings: StandingsModel[];
  homeTeamId: number;
  leagueId: number;
}) => {
  let teamStanding: StandingsDataStandingModel;
  standings.forEach(standing => {
    standing?.response[0]?.league.standings.forEach(teamStanding_ => {
      teamStanding_.forEach(standing_ => {
        if (`${standing_.team.id}` === `${homeTeamId}`) {
          teamStanding = standing_;
        }
      });
    });
  });
  return teamStanding;
};

export const getAwayTeamStanding = ({
  standings,
  awayTeamId,
  leagueId,
}: {
  standings: StandingsModel[];
  awayTeamId: number;
  leagueId: number;
}) => {
  let teamStanding: StandingsDataStandingModel;
  standings.forEach(standing => {
    standing.response[0]?.league.standings.forEach(teamStanding_ => {
      teamStanding_.forEach(standing_ => {
        if (`${standing_.team.id}` === `${awayTeamId}`) {
          teamStanding = standing_;
        }
      });
    });
  });
  return teamStanding;
};

const homeTeamGoalsPercentage = ({
  homeTeamStanding,
}: {
  homeTeamStanding: StandingsDataStandingModel;
}) => {
  const numberOfMatches = homeTeamStanding?.all.played;
  const goalsScored = homeTeamStanding?.all.goals.for;
  return (goalsScored / numberOfMatches) * 100;
};

const awayTeamGoalsPercentage = ({
  awayTeamStanding,
}: {
  awayTeamStanding: StandingsDataStandingModel;
}) => {
  const numberOfMatches = awayTeamStanding?.all.played;
  const goalsScored = awayTeamStanding?.all.goals.for;
  return (goalsScored / numberOfMatches) * 100;
};

const againstHomeTeamGoalsPercentage = ({
  homeTeamStanding,
}: {
  homeTeamStanding: StandingsDataStandingModel;
}) => {
  const numberOfMatches = homeTeamStanding?.all.played;
  const goalsScored = homeTeamStanding?.all.goals.against;
  return (goalsScored / numberOfMatches) * 100;
};

const againstAwayTeamGoalsPercentage = ({
  awayTeamStanding,
}: {
  awayTeamStanding: StandingsDataStandingModel;
}) => {
  const numberOfMatches = awayTeamStanding?.all.played;
  const goalsScored = awayTeamStanding?.all.goals.against;
  return (goalsScored / numberOfMatches) * 100;
};




export const awayTeamScroreInMostH2HFixtures =({h2hFixtures, minGoals, awayTeamId}: {h2hFixtures: FixtureDataModel[]; minGoals: number, awayTeamId: number })=>{
  let conditionPassedCount =0;
  h2hFixtures.forEach(fixtureData=> {
      if(((fixtureData.goals.home>= minGoals) && fixtureData.teams.home.id ===awayTeamId) || ((fixtureData.goals.away>= minGoals) && fixtureData.teams.away.id ===awayTeamId) ){
          conditionPassedCount+=1;
      }
})
if(((conditionPassedCount/h2hFixtures.length))>= 0.6){
    return true;
}else{
    return false
}
}

export const homeTeamScroreInMostH2HFixtures =({h2hFixtures, minGoals, homeTeamId}: {h2hFixtures: FixtureDataModel[]; minGoals: number, homeTeamId: number })=>{
  let conditionPassedCount =0;
  h2hFixtures.forEach(fixtureData=> {
    if(((fixtureData.goals.home>= minGoals) && fixtureData.teams.home.id ===homeTeamId) || ((fixtureData.goals.away>= minGoals) && fixtureData.teams.away.id ===homeTeamId) ){
        conditionPassedCount+=1;
    }
})
if(((conditionPassedCount/h2hFixtures.length))>=0.6){
    return true;
}else{
    return false
}
}

