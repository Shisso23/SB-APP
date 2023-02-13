import authNetworkService from '../auth-network-service/auth-network.service';
import {FixturesFilterModel} from '../../models/fixtures/index'

const endpoint = 'fixtures';

//date format: 2021-04-07
export const getFixturesByDate = async (date: string) => {
    return authNetworkService.get(endpoint, {
        params: {
            date
        }
    })
} 

export const getFixturesBetweenTwoDates = async ({from, to}: { from: string; to: string}) => {
    return authNetworkService.get(endpoint, {
        params: {
            from,
            to
        }
    })
} 

export const getFilteredFixtures = async (filters: FixturesFilterModel) => {
    return authNetworkService.get(endpoint, {
        params: filters
    })
} 

export const getH2hFixtures = (filters: FixturesFilterModel)=>{
    return authNetworkService.get(`${endpoint}/headtohead`, {
        params: filters
    })
}