# Changelog
All notable changes to this project (after v6.0.0) are documented in this file.

The format is (mostly) based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [7.0.0] - Unreleased
Requires Redux 5 or Redux Toolkit 2. Stored data from v5 and v6 is read as is,
and v7 writes the same format. See the [migration guide](docs/MigrationGuide-v7.md).

6.1.0 below was never released; its changes ship in 7.0.0.

### Added
- `allowlist` and `denylist`, checked against your state's keys (`whitelist` and `blacklist` still work)
- `useRehydrated(persistor)` hook in `redux-persist/react`
- Short import paths (`redux-persist/storage`, `redux-persist/react`, ...) and an `exports` map with native ES modules; all v6 paths keep working
- Async migrations
- Root type exports (`PersistConfig`, `Persistor`, ...) restored; typed `persistReducer`, `persistCombineReducers` and `createTransform`
- `persistor.flush()` guidance for saving before a tab closes or an app is backgrounded
- `DEFAULT_TIMEOUT` is exported (#1060)
- A development warning when state is reset above `persistReducer` (which stops saving), and docs for resetting state on logout (#659)
- A development warning when `replaceReducer` swaps in a `persistReducer` that saves under a different key (for example a per-user `keyPrefix`): the current state is written there, over what's stored (#1112)

### Changed
- Redux Toolkit works without `serializableCheck.ignoredActions`: actions no longer carry functions
- `REHYDRATE`'s `err` is a plain `{ name, message }` object
- Persistence state (paused, purged, read failures) is per store
- `PERSIST`, `PURGE` and `FLUSH` dispatched outside the persistor (for example a devtools import) are ignored instead of throwing or purging storage
- Throttled writes are batched into one write per interval
- When the reducer's state is frozen (Redux Toolkit / immer), the state `persistReducer` returns is frozen too, instead of its top level being mutable (#1298)

### Removed
- The UMD build (`dist/redux-persist.js`, `dist/redux-persist.min.js`). Use a bundler or an ES module CDN; see the migration guide
- TypeScript sources (`src/`) from the published package

### Fixed
- Stored data is no longer overwritten with initial state after a failed or timed-out read (#809)
- 5-second hang and timeout error on first run with empty storage
- Crash when the whole state can't be serialized (#1485)
- Throttle starving writes or taking N × throttle to save (#720, #1171)
- Spurious timeout errors from repeated `persist()` (#1107)
- "failed to create sync storage" during server rendering (#1208, #1464)
- `PersistGate` flashing `loading` when already rehydrated (#1070), and "cannot be used as a JSX component" with two copies of `@types/react` (#1375)
- A store with preloaded `_persist` (server-rendered state) never bootstrapping
- "Class extends value undefined" / "Super expression must either be null or a function" when `PersistGate` is rendered from a React Server Component: it now explains that it needs a Client Component (#796, #1442)
- Writes stopping after a transform throws, or after hot reloading the reducer
- A reducer throwing while handling `REHYDRATE` left the app unbootstrapped and fired a misleading timeout (#719)
- Type errors when passing `stateReconciler: hardSet` / `autoMergeLevel1` / `autoMergeLevel2` inline (#1368)
- Array or primitive state passed to `persistReducer` was silently turned into an object; now reported in development (#215)
- With Redux DevTools, replacing the reducer (hot reloading, injected reducers) or toggling an action read stored state again, which could undo recent changes, and repeated purges; replays now rebuild the same state without reading or purging storage, and leave pausing and the stored version as they were (#1387)
- `persistStore` crashing with a storage engine that returns values instead of promises, such as a synchronous engine or a Jest mock: each storage method can now return either, and one that throws is handled like a failed read or write (#1397, #1281)
- A storage read that rejected without a reason was taken for empty storage, so initial state was saved over the stored data; it's now a failed read, as is a callback-style `getItem` that returns nothing
- After `persistor.purge()`, a nested `persistReducer` whose read finished after the purge, or one added later (code splitting), never finished rehydrating, so it stopped saving: the purged parent swallowed its `REHYDRATE`

## [6.1.0] - 2021-10-17 (never published)
Thanks to [@smellman](https://github.com/smellman) for the TypeScript updates.

### Added
- TypeScript support
- GitHub Actions

### Changed
- Move from Flow to TypeScript
- Move from TravisCI to GitHub Actions ([.github/workflows/ci.yml](.github/workflows/ci.yml))
- Version updates for some dependencies

### Removed
- Flow
- TravisCI
