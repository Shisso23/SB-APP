import { setLeagues, setIsLoadingLeagues } from "./leagues.reducer";
import { getFilteredLeagues } from '../../services/leagues/index';
import { LeaguesFilterModel } from "../../models/leagues";

export const geFilteredLeaguesAction = async (filters: LeaguesFilterModel) => async (dispatch: any) => {
  dispatch(setIsLoadingLeagues(true));

  return getFilteredLeagues(filters)
    .then((leagues) => {
      return dispatch(setLeagues(leagues.data));
    })
    .catch((error) => error)
    .finally(() => {
      dispatch(setIsLoadingLeagues(false));
    });
};
