/* eslint-disable @typescript-eslint/no-explicit-any */
// #1298: Redux Toolkit (immer) freezes the state it produces. The object
// persistReducer returns, which adds _persist, should be frozen too, rather
// than being the one mutable level.
import { expect, test } from 'vitest'
import { configureStore, createSlice } from '@reduxjs/toolkit'
import { legacy_createStore as createStore } from 'redux'

import { persistReducer, persistStore, PURGE } from '../src'
import createMemoryStorage from './utils/createMemoryStorage'
import sleep from './utils/sleep'

const slice = createSlice({
  name: 'settings',
  initialState: { theme: { mode: 'light' } },
  reducers: { toggle: state => { state.theme.mode = state.theme.mode === 'light' ? 'dark' : 'light' } },
  extraReducers: builder => builder.addCase(PURGE, () => ({ theme: { mode: 'light' } })),
})

test('state is frozen when the reducer freezes its state', async () => {
  const storage = createMemoryStorage()
  const store = configureStore({ reducer: persistReducer({ key: 'root', storage }, slice.reducer) })
  const persistor = persistStore(store)
  await sleep(10)
  // from startup, before any action the slice handles
  expect(Object.isFrozen(store.getState())).toBe(true)

  store.dispatch(slice.actions.toggle())
  const state: any = store.getState()
  expect(Object.isFrozen(state)).toBe(true)
  expect(Object.isFrozen(state.theme)).toBe(true)
  expect(() => { state.theme = { mode: 'light' } }).toThrow(TypeError)

  // it still saves and rehydrates
  await persistor.flush()
  const next = configureStore({ reducer: persistReducer({ key: 'root', storage }, slice.reducer) })
  persistStore(next)
  await sleep(10)
  expect(next.getState().theme.mode).toBe('dark')

  // a reducer handling PURGE
  await persistor.purge()
  expect(Object.isFrozen(store.getState())).toBe(true)
  expect(store.getState().theme.mode).toBe('light')
})

test('state is not frozen when the reducer does not freeze its state', async () => {
  const reducer = (state: any = { count: 0 }, action: any) =>
    action.type === 'INC' ? { ...state, count: state.count + 1 } : state
  const store = createStore(persistReducer({ key: 'root', storage: createMemoryStorage() }, reducer))
  persistStore(store)
  await sleep(10)
  store.dispatch({ type: 'INC' })
  expect(Object.isFrozen(store.getState())).toBe(false)
})
