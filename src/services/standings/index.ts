import authNetworkService from '../auth-network-service/auth-network.service';
import {StandingsModel} from '../../models/standings-models'

const endpoint = 'standings';

export const getStandingsByTeamId = async ({teamId, season, leagueId}: {teamId:number; season: number, leagueId: number}) => {
    const response=  authNetworkService.get(endpoint, {
        params: {
            season,
            team: teamId,
            league: leagueId
        }
    })
    return new StandingsModel({
        errors: (await response).data.errors,
        response: (await response).data.response,
        results: (await response).data.results
    })
} 