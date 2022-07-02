export class FixturesModel {
    public errors: String [];
    public results: Number;
    public paging: FixturePagingModel;
    public response: FixtureDataModel[];
    /**
     *
     */
    constructor(init: FixturesModel) {
        this.errors = init.errors;
        this.results = init.results;
        this.paging = init.paging;
        this.response = init.response;
    }
}

export class FixturePagingModel {
    public current: Number;
    public total: Number;
    constructor(init: FixturePagingModel) {
       this.current = init.current;
       this.total = init.total;
    }
}

export class FixtureDataModel {
    public fixture: FixtureDataFixtureModel;
    public league: FixtureDataLeagueModel;
    public teams: FixtureDataTeamsModel;
    public goals: FixtureDataGoalsModel;
    public score: FixtureDataScoreModel;
    constructor(init: FixtureDataModel) {
       this.fixture = init.fixture;
       this.league = init.league;
       this.teams = init.teams;
       this.goals = init.goals;
       this.score = init.score;
    }
}

export class FixtureDataFixtureModel {
    public id: Number;
    public timezone: String;
    public date: String;
    public timestamp: Number;
    public status: FixtureDataFixtureStatusModel

    constructor(init: FixtureDataFixtureModel) {
       this.id = init.id;
       this.timestamp = init.timestamp;
       this.timezone = init.timezone;
       this.status = init.status;
       this.date = init.date;
    }
}

export class FixtureDataFixtureStatusModel {
    public long: String;
    public short: String;
    public elapsed: Number;
    constructor(init: FixtureDataFixtureStatusModel) {
       this.long = init.long;
       this.short = init.short;
       this.elapsed = init.elapsed;
    }
}

export class FixtureDataLeagueModel {
    public id: Number;
    public name: String;
    public country: String;
    public logo: String;
    public season: Number;
    constructor(init: FixtureDataLeagueModel) {
       this.id = init.id;
       this.name = init.name;
       this.country = init.country;
       this.logo = init.logo;
       this.season = init.season;
    }
}

export class FixtureDataTeamModel {
    public id: Number;
    public name: String;
    public logo: String;
    public winner: Boolean;
    constructor(init: FixtureDataTeamModel) {
       this.id = init.id;
       this.logo = init.logo;
       this.winner = init.winner;
       this.name = init.name;
 
    }
}

export class FixtureDataTeamsModel {
    public home: FixtureDataTeamModel;
    public away: FixtureDataTeamModel;
    constructor(init: FixtureDataTeamsModel) {
       this.home = init.home;
       this.away = init.away;
    }
}

export class FixtureDataGoalsModel {
    public home: Number ;
    public away: Number;
    constructor(init: FixtureDataGoalsModel) {
       this.home = init.home;
       this.away = init.away;
    }
}
export class FixtureDataScoreModel {
    public halfTime: FixtureDataGoalsModel;
    public fullTime: FixtureDataGoalsModel;
    public extraTime: FixtureDataGoalsModel;
    constructor(init: FixtureDataScoreModel) {
       this.halfTime = init.halfTime;
       this.fullTime = init.fullTime;
       this.extraTime = init.extraTime;
    }
}


export class FixturesFilterModel {
    public h2h?: String;
    public live?: String;
    public date?: String;
    public league?: Number;
    public season?: Number;
    public team?: Number;
    public last?: Number;
    public next?: Number;
    public from?: String;
    public to?: String;
    constructor(init: FixturesFilterModel) {
       this.live = init.live;
       this.date = init.date;
       this.league = init.league;
       this.season = init.season;
       this.team = init.team;
       this.last = init.last;
       this.next = init.next;
       this.from = init.from;
       this.to = init.to;
       this.h2h =  init.h2h;
    }
}


 
 
 