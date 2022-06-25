import { FixturesFilterModel } from "../../models/fixtures";
import { setFixtures, setIsLoadingFixtures } from "./fixtures.reducer";
import { getFilteredFixtures } from '../../services/fixtures/index';

export const geFilteredFixturesAction = async (filters: FixturesFilterModel) => async (dispatch: Function) => {
  dispatch(setIsLoadingFixtures(true));

  return getFilteredFixtures(filters)
    .then((fixtures) => {
      return dispatch(setFixtures(fixtures.data));
    })
    .catch((error) => error)
    .finally(() => {
      dispatch(setIsLoadingFixtures(false));
    });
};
