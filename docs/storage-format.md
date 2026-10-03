# Storage format

redux-persist writes to storage that lives on users' devices. When an app
upgrades redux-persist, its users still have data written by the old version,
and if the new version can't read it they silently lose their saved state.

## Compatibility rule

API changes are allowed in major versions. Changes to stored data are not:

1. **Read everything earlier versions wrote.** Data written by v5 and v6 must be
   read correctly with no migration step, including custom `keyPrefix`,
   `version` with `migrate`, `allowlist`/`denylist` (and `whitelist`/`blacklist`), nested persists and
   `serialize: false`.
2. **Write the same format.** Apps must be able to roll back to an earlier
   major version without losing data.
3. **If the format ever has to change,** read the old format automatically,
   keep rule 2 in mind, and add the new format to the fixtures below alongside
   the old ones rather than replacing them.

Data written by v4 used a different layout (one storage key per reducer). It is
read by `getStoredState` from `redux-persist/integration/getStoredStateMigrateV4`,
which stays available for that reason.

## How it's enforced

`tests/storageCompat.spec.ts` runs against
`tests/fixtures/storage-v5-v6.json`, the exact bytes published v5.10.0 and
v6.0.0 wrote for each scenario. For every fixture it checks that the current
code reads it back to the right state and writes identical bytes for the same
state. The fixtures are recorded from the published packages by
`scripts/storage-fixtures/generate.js`; don't edit them by hand.

To add a scenario or a version, add it to the generator and run:

```sh
cd scripts/storage-fixtures
npm install --ignore-scripts
node generate.js
```

## The format

Each `persistReducer` stores one item. Its key is `keyPrefix` (default
`persist:`) followed by `config.key`.

With the default serializer, the value is a JSON string of an object whose
values are themselves JSON strings: one per persisted top-level state key, plus
`_persist`:

```js
// state: { user: { name: 'Ada' }, count: 3 }, key: 'root'
storage['persist:root'] ===
  '{"_persist":"{\\"version\\":-1,\\"rehydrated\\":true}","user":"{\\"name\\":\\"Ada\\"}","count":"3"}'
```

- Keys excluded by `allowlist`/`denylist` (or the older `whitelist`/`blacklist`) are not stored.
- `_persist.version` is the config `version` (default `-1`) and drives `migrate`.
- Transforms run on each top-level value before it is serialized (`in`) and
  after it is deserialized (`out`).
- With `serialize: false` the same object is stored without any JSON encoding,
  for storage engines that accept objects.
- Nested persists are stored separately under their own key; the parent
  excludes them with `denylist` (or `blacklist`).
