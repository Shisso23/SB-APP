import { createStore, applyMiddleware } from 'redux';
import ReduxThunk from 'redux-thunk';
import ReduxPromise from  'redux-promise'

import reducers from '../reducers/root.reducer';

// Infer the `RootState` and `AppDispatch` types from the store itself
export default createStore(reducers, applyMiddleware(ReduxPromise, ReduxThunk));
