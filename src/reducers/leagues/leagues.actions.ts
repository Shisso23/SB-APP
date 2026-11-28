import { setLeagues, setIsLoadingLeagues } from "./leagues.reducer";
import { getFilteredLeagues } from '../../services/leagues/index';
import { LeaguesFilterModel, LeaguesModel } from "../../models/leagues";

/**
 * Load the league catalogue from the PredictXI Django API.
 *
 * Request failures propagate to the caller for display.
 */
export const geFilteredLeaguesAction = (filters: LeaguesFilterModel) => async (dispatch: any) => {
  dispatch(setIsLoadingLeagues(true));

  try {
    const leagues = await getFilteredLeagues(filters);
    return dispatch(setLeagues(leagues.data as LeaguesModel));
  } finally {
    dispatch(setIsLoadingLeagues(false));
  }
};
