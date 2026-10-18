import { apiGet } from '../api/client';
import {StandingsModel, StandingsResponseModel} from '../../models/standings-models'
import { EnvelopeResponse } from '../api/types';

// Standings are stored canonical data served by the PredictXI Django API.
const endpoint = '/standings';

export const getStandingsByTeamId = async ({teamId, season, leagueId}: {teamId:number; season: number, leagueId: number}) => {
    const response = await apiGet<EnvelopeResponse<StandingsResponseModel>>(endpoint, { params: { season, team: teamId, league: leagueId } })
    return new StandingsModel({
        errors: response.data.errors,
        response: response.data.response,
        results: response.data.results
    })
} 


export const getStandingsByLeagueId = async ({season, leagueId}: { season: number, leagueId: number}) => {
    const response = await apiGet<EnvelopeResponse<StandingsResponseModel>>(endpoint, { params: { season, league: leagueId } })
    return new StandingsModel({
        errors: response.data.errors,
        response: response.data.response,
        results: response.data.results
    })
} 