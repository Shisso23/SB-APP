import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import { FixturesModel } from '../../models/fixtures/index';

export interface FixturesState {
  fixtures: FixturesModel,
  isLoadingFixtures: Boolean;
}

const initialState: FixturesState = {
  fixtures: null,
  isLoadingFixtures: false
}

export const fixturesSlice = createSlice({
  name: 'fixtures',
  initialState,
  reducers: {
    setFixtures: (state, action: PayloadAction<FixturesModel>) => {
      state.fixtures = action.payload
    },
    setIsLoadingFixtures: (state, action: PayloadAction<Boolean>) => {
      state.isLoadingFixtures = action.payload
    },
  },
})

// Action creators are generated for each case reducer function
export const { setFixtures, setIsLoadingFixtures } = fixturesSlice.actions
export const fixturesSelector = (reducers: any) => reducers.fixturesReducer;
export default fixturesSlice.reducer