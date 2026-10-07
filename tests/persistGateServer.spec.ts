/* eslint-disable @typescript-eslint/no-explicit-any */
// #1452: stored state only loads in the browser, so on the server PersistGate
// and useRehydrated render as not loaded, whatever the server's persistor
// reports. React hydrates from the same value (the server snapshot) and then
// updates; a client that loaded stored state before React hydrated used to
// render different HTML than the server. (Client-only renders still skip
// `loading` when already loaded, #1070: see persistGate.spec.ts.)
import test from 'ava'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { legacy_createStore as createStore } from 'redux'

import { persistReducer, persistStore } from '../src'
import { PersistGate, useRehydrated } from '../src/integration/react'
import createMemoryStorage from './utils/createMemoryStorage'
import sleep from './utils/sleep'

const loaded = async () => {
  const store = createStore(persistReducer({ key: 'root', storage: createMemoryStorage() }, (state: any = {}) => state))
  const persistor = persistStore(store)
  await sleep(10)
  return persistor
}

test('PersistGate renders loading on the server, even once the persistor has loaded', async t => {
  const persistor = await loaded()
  t.true(persistor.getState().bootstrapped)
  const html = renderToString(
    createElement(PersistGate as any, { persistor, loading: createElement('p', null, 'loading') }, createElement('p', null, 'app'))
  )
  t.is(html, '<p>loading</p>')
})

test('a function child and useRehydrated get false on the server', async t => {
  const persistor = await loaded()
  const Probe = () => createElement('span', null, String(useRehydrated(persistor)))
  const html = renderToString(
    createElement('div', null,
      createElement(PersistGate as any, { persistor, children: (bootstrapped: boolean) => String(bootstrapped) }),
      createElement(Probe))
  )
  t.is(html, '<div>false<span>false</span></div>')
})
