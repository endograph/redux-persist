/* eslint-disable @typescript-eslint/no-explicit-any */
// #1298: Redux Toolkit (immer) freezes the state it produces. The object
// persistReducer returns, which adds _persist, should be frozen too, rather
// than being the one mutable level.
import test from 'ava'
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

test('state is frozen when the reducer freezes its state', async t => {
  const storage = createMemoryStorage()
  const store = configureStore({ reducer: persistReducer({ key: 'root', storage }, slice.reducer) })
  const persistor = persistStore(store)
  await sleep(10)

  store.dispatch(slice.actions.toggle())
  const state: any = store.getState()
  t.true(Object.isFrozen(state))
  t.true(Object.isFrozen(state.theme))
  t.throws(() => { state.theme = { mode: 'light' } }, { instanceOf: TypeError })

  // it still saves and rehydrates
  await persistor.flush()
  const next = configureStore({ reducer: persistReducer({ key: 'root', storage }, slice.reducer) })
  persistStore(next)
  await sleep(10)
  t.is(next.getState().theme.mode, 'dark')

  // a reducer handling PURGE
  await persistor.purge()
  t.true(Object.isFrozen(store.getState()))
  t.is(store.getState().theme.mode, 'light')
})

test('state is not frozen when the reducer does not freeze its state', async t => {
  const reducer = (state: any = { count: 0 }, action: any) =>
    action.type === 'INC' ? { ...state, count: state.count + 1 } : state
  const store = createStore(persistReducer({ key: 'root', storage: createMemoryStorage() }, reducer))
  persistStore(store)
  await sleep(10)
  store.dispatch({ type: 'INC' })
  t.false(Object.isFrozen(store.getState()))
})
