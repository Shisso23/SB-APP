import { FixturesFilterModel, FixturesModel } from "../../models/fixtures";
import { setFixtures, setIsLoadingFixtures } from "./fixtures.reducer";
import { getFilteredFixtures } from '../../services/fixtures/index';

/** Load fixtures from the PredictXI Django API; errors propagate to the caller. */
export const geFilteredFixturesAction = async (filters: FixturesFilterModel) => async (dispatch: Function) => {
  dispatch(setIsLoadingFixtures(true));

  try {
    const fixtures = await getFilteredFixtures(filters);
    return dispatch(setFixtures(fixtures.data as FixturesModel));
  } finally {
    dispatch(setIsLoadingFixtures(false));
  }
};
