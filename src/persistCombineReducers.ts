import { combineReducers } from 'redux'
import type {
  ActionFromReducersMapObject,
  PreloadedStateShapeFromReducersMapObject,
  Reducer,
  StateFromReducersMapObject,
} from 'redux'
import persistReducer from './persistReducer.js'
import autoMergeLevel2 from './stateReconciler/autoMergeLevel2.js'

import type {
  PersistConfig,
  PersistPartial,
} from './types.js'

// combineReducers + persistReducer with stateReconciler defaulted to autoMergeLevel2
export default function persistCombineReducers<M>(
  config: PersistConfig<StateFromReducersMapObject<M>>,
  reducers: M
): Reducer<
  StateFromReducersMapObject<M> & PersistPartial,
  ActionFromReducersMapObject<M>,
  Partial<PreloadedStateShapeFromReducersMapObject<M>> & Partial<PersistPartial>
> {
  config.stateReconciler =
    config.stateReconciler === undefined
      ? autoMergeLevel2
      : config.stateReconciler
  // combineReducers returns a conditional type that TypeScript can't resolve
  // for a generic M; this is what it resolves to for any reducers map
  const combined = combineReducers(reducers) as unknown as Reducer<
    StateFromReducersMapObject<M>,
    ActionFromReducersMapObject<M>,
    Partial<PreloadedStateShapeFromReducersMapObject<M>>
  >
  return persistReducer(config, combined)
}
