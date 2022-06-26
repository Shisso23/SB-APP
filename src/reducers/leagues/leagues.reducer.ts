import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import { LeaguesModel } from '../../models/leagues/index';
export interface LeaguesState {
  leagues: LeaguesModel,
  isLoadingLeagues: Boolean;
}

const initialState: LeaguesState = {
  leagues: null,
  isLoadingLeagues: false
}

export const leaguesSlice = createSlice({
  name: 'leagues',
  initialState,
  reducers: {
    setLeagues: (state, action: PayloadAction<LeaguesModel>) => {
      state.leagues = action.payload
    },
    setIsLoadingLeagues: (state, action: PayloadAction<Boolean>) => {
      state.isLoadingLeagues = action.payload
    },
  },
})

// Action creators are generated for each case reducer function
export const { setLeagues, setIsLoadingLeagues } = leaguesSlice.actions
export const leaguesSelector = (reducers: any) => reducers.leaguesReducer;
export default leaguesSlice.reducer