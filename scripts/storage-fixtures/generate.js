// Records the exact bytes published redux-persist versions write to storage.
// tests/storageCompat.spec.ts checks that the current code reads these and
// writes the same bytes. See docs/storage-format.md.
//
// Regenerate (only needed to add scenarios or versions):
//   cd scripts/storage-fixtures && npm install --ignore-scripts && node generate.js
const fs = require('fs')
const path = require('path')
const { createStore, combineReducers } = require('redux')
const versions = { '5.10.0': require('rp5'), '6.0.0': require('rp6') }

const memoryStorage = () => {
  const data = {}
  return { data, getItem: k => Promise.resolve(data[k]), setItem: (k, v) => { data[k] = v; return Promise.resolve() }, removeItem: k => { delete data[k]; return Promise.resolve() } }
}
const settable = initial => (state = initial, action) => (action.type === 'SET' ? action.state : state)

const STATE = {
  user: { name: 'Ada Lovelace', token: 'secret-token', tags: ['admin', 'beta'] },
  settings: { theme: 'dark', fontSize: 14, notifications: { email: true, push: false } },
  count: 3,
  flag: false,
  nothing: null,
  text: 'héllo "quoted" \\ back\nslash 🎉 <script>',
}

// Each scenario: how to build the reducer, the persist config, and the state to write.
const scenarios = {
  basic: { config: { key: 'root' }, state: STATE },
  keyPrefix: { config: { key: 'root', keyPrefix: 'myapp:' }, state: STATE },
  whitelist: { config: { key: 'root', whitelist: ['settings', 'count'] }, state: STATE },
  blacklist: { config: { key: 'root', blacklist: ['user'] }, state: STATE },
  versioned: { config: { key: 'root', version: 1 }, state: { profile: { firstName: 'Ada', lastName: 'Lovelace' } } },
  emptyObjects: { config: { key: 'root' }, state: { a: {}, b: [], c: '' } },
  serializeFalse: { config: { key: 'root', serialize: false, deserialize: false }, state: { user: { name: 'Ada' }, count: 1 } },
}

async function run(version, scenario) {
  const { persistReducer, persistStore } = versions[version]
  const storage = memoryStorage()
  const config = { ...scenario.config, storage }
  const store = createStore(persistReducer(config, settable({})))
  const persistor = await new Promise(res => { const p = persistStore(store, null, () => res(p)) })
  // dispatch a copy: v5 and v6 add _persist onto the object the reducer returns
  store.dispatch({ type: 'SET', state: structuredClone(scenario.state) })
  await persistor.flush()
  await new Promise(r => setTimeout(r, 20))
  return storage.data
}

async function runNested(version) {
  const { persistReducer, persistStore } = versions[version]
  const storage = memoryStorage()
  const slice = type => (state = {}, action) => (action.type === type ? action.state : state)
  const root = combineReducers({
    user: persistReducer({ key: 'user', storage, blacklist: ['token'] }, slice('SET_USER')),
    settings: slice('SET_SETTINGS'),
  })
  const store = createStore(persistReducer({ key: 'root', storage, blacklist: ['user'] }, root))
  const persistor = await new Promise(res => { const p = persistStore(store, null, () => res(p)) })
  store.dispatch({ type: 'SET_USER', state: { name: 'Ada', token: 'secret-token' } })
  store.dispatch({ type: 'SET_SETTINGS', state: { theme: 'dark' } })
  await persistor.flush()
  await new Promise(r => setTimeout(r, 20))
  return { state: store.getState(), storage: storage.data }
}

;(async () => {
  const out = { generatedBy: 'scripts/storage-fixtures/generate.js', fixtures: [] }
  for (const version of Object.keys(versions)) {
    for (const [name, scenario] of Object.entries(scenarios)) {
      const storage = await run(version, scenario)
      out.fixtures.push({ version, name, config: scenario.config, state: scenario.state, storage })
    }
    const nested = await runNested(version)
    out.fixtures.push({
      version, name: 'nested',
      config: { root: { key: 'root', blacklist: ['user'] }, user: { key: 'user', blacklist: ['token'] } },
      state: { user: { name: 'Ada', token: 'secret-token' }, settings: { theme: 'dark' } },
      storage: nested.storage,
    })
  }
  const file = path.join(__dirname, '../../tests/fixtures/storage-v5-v6.json')
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + '\n')
  console.log(`wrote ${out.fixtures.length} fixtures to ${path.relative(process.cwd(), file)}`)
})()
