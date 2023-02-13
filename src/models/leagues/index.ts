export class LeaguesModel {
    public errors: string [];
    public results: number;
    public paging: LeaguePagingModel;
    public response: LeagueDataModel[];
    /**
     *
     */
    constructor(init: LeaguesModel) {
        this.errors = init.errors;
        this.results = init.results;
        this.paging = init.paging;
        this.response = init.response;
    }
}

export class LeaguePagingModel {
    public current: number;
    public total: number;
    constructor(init: LeaguePagingModel) {
       this.current = init.current;
       this.total = init.total;
    }
}

export class LeagueDataModel {
    public league: LeagueDataLeagueModel;
    public country: LeagueDataCountryModel;
    public seasons: LeagueDataSeasonsModel [];
    constructor(init: LeagueDataModel) {
       this.league = init.league;
       this.country = init.country;
       this.seasons = init.seasons;
    }
}

export class LeagueDataLeagueModel {
    public id: number;
    public name: string;
    public type: string;
    public logo: string;
    public selected: string;

    constructor(init: LeagueDataLeagueModel) {
       this.id = init.id;
       this.name = init.name;
       this.type = init.type;
       this.logo = init.logo;
       this.selected = init.selected;
    }
}

export class LeagueDataCountryModel {
    public name: string;
    public flag: string;
    public code: string;
    constructor(init: LeagueDataCountryModel) {
       this.name = init.name;
       this.code = init.code;
       this.flag = init.flag;
    }
}

export class LeagueDataSeasonsModel {
    public year: number;
    public start: string;
    public end: string;
    public current: boolean
    constructor(init: LeagueDataSeasonsModel) {
       this.year = init.year;
       this.start = init.start;
       this.end = init.end;
       this.current = init.current
    }
}


export class LeaguesFilterModel {
    public id?: number;
    public name?: string;
    public country?: string;
    public code?: string;
    public season?: number;
    public team?: number;
    public type?: string;
    public current?: boolean;
    public search?: string
    constructor(init: LeaguesFilterModel) {
       this.id = init.id;
       this.name = init.name;
       this.code = init.code;
       this.country = init.country;
       this.team = init.team;
       this.type = init.type;
       this.current = init.current;
       this.season = init.season;
       this.search = init.search;
    }
}