import { setLeagues, setIsLoadingLeagues } from "./leagues.reducer";
import { getFilteredLeagues } from '../../services/leagues/index';
import { LeaguesFilterModel, LeaguesModel } from "../../models/leagues";

/**
 * Load the league catalogue from the PredictXI Django API.
 *
 * Auth/premium failures are re-thrown so screens can show an explicit state rather
 * than an empty list that looks like "no leagues".
 */
export const geFilteredLeaguesAction = async (filters: LeaguesFilterModel) => async (dispatch: any) => {
  dispatch(setIsLoadingLeagues(true));

  try {
    const leagues = await getFilteredLeagues(filters);
    return dispatch(setLeagues(leagues.data as LeaguesModel));
  } finally {
    dispatch(setIsLoadingLeagues(false));
  }
};
