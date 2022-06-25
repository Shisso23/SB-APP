export interface FixturesDto {
   parameter: fixtureParameterDto;
   errors:  String [];
   results: Number;
   paging: FixturePagingDto;
   response: FixtureDataDto[];
  };


  export interface FixtureDataDto{
    fixture: FixtureDataDFixtureto;
    league: FixtureDataLeagueDto;
    teams: FixtureDataTeamsDto;
    goals: FixtureDataGoalsDto;
    score: FixtureDataScoreDto;
    
}

export interface FixtureDataLeagueDto{
    id: Number;
    name: String;
    country: String;
    logo: String;
    season: String;
    round: String;
}

export interface FixtureDataTeamsDto{
    home: FixtureDataTeamDto;
    away: FixtureDataTeamDto
}

export interface FixtureDataTeamDto{
    id: Number;
    name: String;
    logo: String;
    winner: Boolean;
}

export interface FixtureDataGoalsDto{
    home: Number;
    away: Number;
}

export interface FixtureDataScoreDto{
    halfTime: FixtureDataGoalsDto;
    fullTime: FixtureDataGoalsDto;
    extraTime: FixtureDataGoalsDto;
}

  export interface FixtureDataDFixtureto{
    id: Number;
    date: string;
    timestamp: Number;
    status: FixtureStatusDto;
}

export interface FixtureStatusDto{
    long: String;
    short: String;
    elapsed: Number;
}


  export interface FixturePagingDto{
    current: Number;
    total: Number;
}

  export interface fixtureParameterDto{
      league: String;
      season: string;
  }