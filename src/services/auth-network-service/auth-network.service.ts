import ax from 'axios';
import config from '../../config'




const authNetworkService = ax.create({
  timeout: 60000,
  baseURL: config.apiUrl,
  headers: {

    // 'X-RapidAPI-Key': config.apiKey,
    'x-apisports-key': config.xApiSportsKey,
    // 'X-RapidAPI-Host': 'api-football-v1.p.rapidapi.com',
    // Accept: 'application/json',
    // 'content-type': 'application/json',
    // 'Access-Control-Allow-Origin': '*',
  },
  responseType: 'json',
});

export default authNetworkService;
