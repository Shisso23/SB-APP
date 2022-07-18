export class StandingsModel {
    public errors: String [];
    public results: number;
    public response: StandingsResponseModel[];
    /**
     *
     */
    constructor(init: StandingsModel) {
        this.errors = init.errors;
        this.results = init.results;
        this.response = init.response;
    }
}

export class StandingsResponseModel {
    public league: StandingsDataLeagueModel;

    constructor(init: StandingsResponseModel) {
        this.league = init.league;
    }
}

export class StandingsDataLeagueModel {
    public id: number;
    public name: String;
    public country: String;
    public logo: String;
    public season: number;
    public flag: string;
    public standings: StandingsDataStandingModel[][];
    constructor(init: StandingsDataLeagueModel) {
       this.id = init.id;
       this.name = init.name;
       this.country = init.country;
       this.logo = init.logo;
       this.season = init.season;
       this.flag = init.flag;
       this.standings = init.standings;
    }
}

export class StandingsDataStandingModel {
    public rank: number;
    public team: standingDataStandingsTeamModel;
    public points: String;
    public goalsDiff: number;
    public season: number;
    public group: String;
    public form: String;
    public status: String;
    public description: String;
    public all: standingDataStandingsAllModel;
    constructor(init: StandingsDataStandingModel) {
       this.rank = init.rank;
       this.team = init.team;
       this.points = init.points;
       this.season = init.season;
       this.group = init.group;
       this.goalsDiff = init.goalsDiff;
       this.form = init.form;
       this.status = init.status;
       this.description = init.description
       this.all = init.all
    }
}

export class standingDataStandingsTeamModel {
    public id: number;
    public name: String;
    public logo: String;
    constructor(init: standingDataStandingsTeamModel) {
       this.id = init.id;
       this.logo = init.logo;
       this.name = init.name;
 
    }
}


export class standingDataStandingsAllModel {
    public played: number;
    public win: number;
    public draw: number;
    public lose: number;
    public goals: standingDataStandingsAllGoalsModel;
    constructor(init: standingDataStandingsAllModel) {
       this.played = init.played;
       this.win = init.win;
       this.draw = init.draw;
       this.lose = init.lose;
       this.goals = init.goals;
    }
}
export class standingDataStandingsAllGoalsModel {
    public for: number;
    public against: number;
    constructor(init: standingDataStandingsAllGoalsModel) {
       this.for = init.for;
       this.against = init.against;
    }
}