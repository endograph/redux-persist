/* eslint-disable @typescript-eslint/no-explicit-any */

// persistStore needs to pass callbacks to every persistReducer, including ones
// nested inside combineReducers. Functions in actions trip RTK's serializability
// check and can't be replayed by devtools, so the callbacks travel under a
// non-enumerable symbol key instead: the action stays a plain, serializable
// object, and a replayed copy simply has no handle.
// Symbol.for keeps this working if two copies of redux-persist are loaded.
const HANDLE = Symbol.for('redux-persist/persistor-handle')

export interface PersistorHandle {
  register?: (key: string) => void
  rehydrate?: (key: string, payload: any, err?: any) => void
  result?: (result: Promise<any> | null | undefined) => void
}

export function attachHandle<A extends object>(action: A, handle: PersistorHandle): A {
  Object.defineProperty(action, HANDLE, { value: handle, enumerable: false })
  return action
}

export function getHandle(action: any): PersistorHandle | undefined {
  return action && typeof action === 'object' ? action[HANDLE] : undefined
}
