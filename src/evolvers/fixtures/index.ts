import {  FixtureDataDto, FixtureDataFixtureDto, FixturesDto } from '../../dto/fixtures';
import { FixtureDataLeagueModel, FixturesModel } from '../../models/fixtures';
import { FixtureDataModel } from '../../models/fixtures/index';
import { FixtureDataFixtureModel } from '../../models/fixtures/index';
import { FixtureDataLeagueDto } from '../../dto/fixtures/index';


export class FixturesEvolver {
    public static toModel(dto: FixturesDto): FixturesModel {
        return {
            errors: dto.errors,
            paging: dto.paging,
            response: dto.response,
            results: dto.results,
        };
    } 
}


export class FixturesDataEvolver {
    public static toModel(dto: FixtureDataDto): FixtureDataModel {
        return {
            fixture: dto.fixture,
            goals: dto.goals,
            league: dto.league,
            score: dto.score,
            teams: dto.teams,
        };
    }
}


export class FixturesDataFixtureEvolver {
    public static toModel(dto: FixtureDataFixtureDto): FixtureDataFixtureModel {
        return {
           date: dto.date,
           id: dto.id,
           status: dto.status,
           timestamp: dto.timestamp,
           timezone: dto.timezone,
        };
    }
}

export class FixturesDataLeagueEvolver {
    public static toModel(dto: FixtureDataLeagueDto): FixtureDataLeagueModel {
        return {
           country: dto.country,
           id: dto.id,
           logo: dto.logo,
           name: dto.name,
           season: dto.season
        };
    }
}