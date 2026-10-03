/*
  autoMergeLevel1: 
    - merges 1 level of substate
    - skips substate if already modified
*/

import type { PersistConfig } from '../types'
import { KeyAccessState } from '../types'

export default function autoMergeLevel1<S extends KeyAccessState>(
  inboundState: S,
  originalState: S,
  reducedState: S,
  { debug }: PersistConfig<S>
): S {
  const newState = { ...reducedState }
  // only rehydrate if inboundState exists and is an object
  if (inboundState && typeof inboundState === 'object') {
    const keys: (keyof S)[] = Object.keys(inboundState)
    keys.forEach(key => {
      // ignore _persist data
      if (key === '_persist') return
      // if reducer modifies substate, skip auto rehydration
      if (originalState[key] !== reducedState[key]) {
        if (process.env.NODE_ENV !== 'production' && debug)
          console.log(
            'redux-persist/stateReconciler: sub state for key `%s` modified, skipping.',
            key
          )
        return
      }
      // otherwise hard set the new value
      newState[key] = inboundState[key]
    })
  }

  if (
    process.env.NODE_ENV !== 'production' &&
    debug &&
    inboundState &&
    typeof inboundState === 'object'
  )
    console.log(
      `redux-persist/stateReconciler: rehydrated keys '${Object.keys(
        inboundState
      ).join(', ')}'`
    )

  return newState
}
