
/** League catalogue reads from the PredictXI Django API. */
import { apiGet } from '../api/client';
import { LeaguesFilterModel } from '../../models/leagues';

const endpoint = '/leagues';

export const getFilteredLeagues = async (filters: LeaguesFilterModel) => {
    const params: Record<string, string | number | boolean> = {};
    const entries: Array<[string, unknown]> = [
        ['id', filters.id],
        ['name', filters.name],
        ['country', filters.country],
        ['code', filters.code],
        ['season', filters.season],
        ['team', filters.team],
        ['type', filters.type],
        ['search', filters.search],
    ];
    entries.forEach(([key, value]) => {
        if (value !== undefined && value !== null && `${value}` !== '') {
            params[key] = value as string | number;
        }
    });
    if (typeof filters.current === 'boolean') {
        params.current = filters.current;
    }
    return apiGet(endpoint, { params })
}

