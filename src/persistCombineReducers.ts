/* eslint-disable @typescript-eslint/no-explicit-any */
import { combineReducers, ReducersMapObject } from 'redux'
import persistReducer from './persistReducer'
import autoMergeLevel2 from './stateReconciler/autoMergeLevel2'

import type {
  PersistConfig,
  PersistState,
} from './types'

// combineReducers + persistReducer with stateReconciler defaulted to autoMergeLevel2
export default function persistCombineReducers<S>(
  config: PersistConfig<S>,
  reducers: ReducersMapObject<S, any>
): (state: (S & { _persist?: PersistState }) | undefined, action: any) => S & { _persist: PersistState } {
  config.stateReconciler =
    config.stateReconciler === undefined
      ? autoMergeLevel2
      : config.stateReconciler
  // Redux 4 brands combined state as CombinedState<S>; the public signature above uses plain S
  const combined = combineReducers(reducers) as unknown as (state: S | undefined, action: any) => S
  return persistReducer(config, combined)
}
