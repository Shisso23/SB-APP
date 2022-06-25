export interface FixturesDto {
   errors:  String [];
   results: Number;
   paging: FixturePagingDto;
   response: FixtureDataDto[];
  };


  export interface FixtureDataDto{
    fixture: FixtureDataFixtureDto;
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
    season: Number;
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

  export interface FixtureDataFixtureDto{
    id: Number;
    date: string;
    timestamp: Number;
    timezone: String;
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