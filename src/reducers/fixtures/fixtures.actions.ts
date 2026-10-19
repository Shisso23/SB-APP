import { FixturesFilterModel, FixturesModel } from "../../models/fixtures";
import { setFixtures, setIsLoadingFixtures } from "./fixtures.reducer";
import { getFilteredFixtures } from '../../services/fixtures/index';

/** Minimal dispatch shape: accepts thunks and plain action objects. */
type ThunkDispatch = (action: unknown) => unknown;

/** Load fixtures from the PredictXI Django API; errors propagate to the caller. */
export const geFilteredFixturesAction = async (filters: FixturesFilterModel) => async (dispatch: ThunkDispatch) => {
  dispatch(setIsLoadingFixtures(true));

  try {
    const fixtures = await getFilteredFixtures(filters);
    return dispatch(setFixtures(fixtures.data as FixturesModel));
  } finally {
    dispatch(setIsLoadingFixtures(false));
  }
};
