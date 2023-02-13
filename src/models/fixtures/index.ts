export class FixturesModel {
    public errors: string [];
    public results: number;
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
    public current: number;
    public total: number;
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
    public id: number;
    public timezone: string;
    public date: string;
    public timestamp: number;
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
    public long: string;
    public short: string;
    public elapsed: number;
    constructor(init: FixtureDataFixtureStatusModel) {
       this.long = init.long;
       this.short = init.short;
       this.elapsed = init.elapsed;
    }
}

export class FixtureDataLeagueModel {
    public id: number;
    public name: string;
    public country: string;
    public logo: string;
    public season: number;
    constructor(init: FixtureDataLeagueModel) {
       this.id = init.id;
       this.name = init.name;
       this.country = init.country;
       this.logo = init.logo;
       this.season = init.season;
    }
}

export class FixtureDataTeamModel {
    public id: number;
    public name: string;
    public logo: string;
    public winner: boolean;
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
    public home: number ;
    public away: number;
    constructor(init: FixtureDataGoalsModel) {
       this.home = init.home;
       this.away = init.away;
    }
}
export class FixtureDataScoreModel {
    public halftime: FixtureDataGoalsModel;
    public fulltime: FixtureDataGoalsModel;
    public extratime: FixtureDataGoalsModel;
    constructor(init: FixtureDataScoreModel) {
       this.halftime = init.halftime;
       this.fulltime = init.fulltime;
       this.extratime = init.extratime;
    }
}


export class FixturesFilterModel {
    public h2h?: string;
    public live?: string;
    public date?: string;
    public league?: number;
    public season?: number;
    public team?: number;
    public last?: number;
    public next?: number;
    public from?: string;
    public to?: string;
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


 
 
 