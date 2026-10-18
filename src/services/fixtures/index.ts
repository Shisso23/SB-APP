/**
 * Fixture reads from the PredictXI Django API.
 *
 * The browser no longer calls API-Football. Filters map onto the Django fixture
 * endpoint, and responses keep the provider-shaped envelope (`errors`/`results`/
 * `paging`/`response`) so existing screens continue to parse them.
 */
import { apiGet } from '../api/client';
import { FixturesFilterModel } from '../../models/fixtures/index';

const endpoint = '/fixtures';

/** Build query params from the shared filter model, dropping empty values. */
const toParams = (filters: FixturesFilterModel) => {
  const params: Record<string, string | number> = {};
  const entries: Array<[string, unknown]> = [
    ['date', filters.date],
    ['from', filters.from],
    ['to', filters.to],
    ['league', filters.league],
    ['season', filters.season],
    ['team', filters.team],
  ];
  entries.forEach(([key, value]) => {
    if (value !== undefined && value !== null && `${value}` !== '') {
      params[key] = value as string | number;
    }
  });
  return params;
};

//date format: 2021-04-07
export const getFixturesByDate = async (date: string) => {
    return apiGet(endpoint, { params: { date } })
} 

export const getFixturesBetweenTwoDates = async ({from, to}: { from: string; to: string}) => {
    return apiGet(endpoint, { params: { from, to } })
} 

export const getFilteredFixtures = async (filters: FixturesFilterModel) => {
    return apiGet(endpoint, { params: toParams(filters) })
} 

/**
 * Head-to-head history for two teams.
 *
 * Django filters stored canonical fixtures, so the client passes the two team ids
 * rather than reconstructing provider query syntax.
 */
export const getH2hFixtures = ({ teamOneId, teamTwoId }: { teamOneId: number; teamTwoId: number }) => {
    return apiGet(`${endpoint}/head-to-head`, { params: { team_a: teamOneId, team_b: teamTwoId } })
}