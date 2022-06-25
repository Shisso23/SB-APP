import { combineReducers } from 'redux';
import store from '../redux/store';
import fixturesReducer from './fixtures/fixtures.reducer';

export type RootState = ReturnType<typeof store.getState>
// Inferred type: {posts: PostsState, comments: CommentsState, users: UsersState}
export type AppDispatch = typeof store.dispatch
export default combineReducers({
    fixturesReducer,
});
