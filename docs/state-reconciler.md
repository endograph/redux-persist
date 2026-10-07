# State Reconciler
State reconcilers define how incoming state, loaded from storage, is merged in with initial state, which comes from your reducers. It is critical to choose the right state reconciler for your state. There are three options that ship out of the box, let's look at how each operates:

1. **hardSet** (`import hardSet from 'redux-persist/stateReconciler/hardSet'`)
This will hard set incoming state. This can be desirable in some cases where persistReducer is nested deeper in your reducer tree, or if you do not rely on initialState in your reducer.
   - **incoming state**: `{ foo: incomingFoo }`
   - **initial state**: `{ foo: initialFoo, bar: initialBar }`
   - **reconciled state**: `{ foo: incomingFoo }` // note bar has been dropped
2. **autoMergeLevel1** (default)
This will auto merge one level deep. Auto merge means if the some piece of substate was modified by your reducer during the REHYDRATE action, it will skip this piece of state. Level 1 means it will shallow merge 1 level deep.
   - **incoming state**: `{ foo: incomingFoo }`
   - **initial state**: `{ foo: initialFoo, bar: initialBar }`
   - **reconciled state**: `{ foo: incomingFoo, bar: initialBar }` // note incomingFoo overwrites initialFoo
3. **autoMergeLevel2** (`import autoMergeLevel2 from 'redux-persist/stateReconciler/autoMergeLevel2'`)
This acts just like autoMergeLevel1, except it shallow merges two levels
   - **incoming state**: `{ foo: incomingFoo }`
   - **initial state**: `{ foo: initialFoo, bar: initialBar }`
   - **reconciled state**: `{ foo: mergedFoo, bar: initialBar }` // note: initialFoo and incomingFoo are shallow merged

#### Example
```js
import hardSet from 'redux-persist/stateReconciler/hardSet'

const persistConfig = {
  key: 'root',
  storage,
  stateReconciler: hardSet,
}
```

### Custom reconcilers
A state reconciler is a function `(inboundState, originalState, reducedState, config) => state`. `inboundState` is what was stored, `reducedState` is your reducers' state after handling `REHYDRATE`, and what it returns becomes the state. For example, to merge stored state in at every level:

```js
const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const mergeDeep = (target, source) => {
  const result = { ...target }
  for (const key of Object.keys(source)) {
    result[key] = isPlainObject(target[key]) && isPlainObject(source[key])
      ? mergeDeep(target[key], source[key])
      : source[key]
  }
  return result
}

const persistConfig = {
  key: 'root',
  storage,
  stateReconciler: (inboundState, originalState, reducedState) => mergeDeep(reducedState, inboundState),
}
```

Arrays are replaced, not merged, and unlike `autoMergeLevel1` and `autoMergeLevel2` this doesn't skip state your reducers changed while handling `REHYDRATE`. To store only part of a top-level key, use a [nested persist](nested-persists.md) instead.

