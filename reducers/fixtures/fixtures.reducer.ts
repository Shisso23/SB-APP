import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import { FixturesDto } from '../../src/dto/fixtures/index';

export interface FixturesState {
  fixtures: FixturesDto
}

const initialState: FixturesState = {
  fixtures: null
}

export const fixturesSlice = createSlice({
  name: 'fixtures',
  initialState,
  reducers: {
    setFixtures: (state, action: PayloadAction<FixturesDto>) => {
      state.fixtures = action.payload
    },
  },
})

// Action creators are generated for each case reducer function
export const { setFixtures } = fixturesSlice.actions

export default fixturesSlice.reducer