/* eslint-disable @typescript-eslint/no-explicit-any */
import { Action, AnyAction, CombinedState, combineReducers, Reducer, ReducersMapObject } from 'redux'
import persistReducer from './persistReducer'
import autoMergeLevel2 from './stateReconciler/autoMergeLevel2'

import type { 
  PersistConfig
} from './types'

// combineReducers + persistReducer with stateReconciler defaulted to autoMergeLevel2
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function persistCombineReducers<S, A extends Action>(
  config: PersistConfig<any>,
  reducers: ReducersMapObject<CombinedState<S>, Action<any>>
): Reducer<any, AnyAction> {
  config.stateReconciler =
    config.stateReconciler === undefined
      ? autoMergeLevel2
      : config.stateReconciler
  return persistReducer(config, combineReducers(reducers))
}
