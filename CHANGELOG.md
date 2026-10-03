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

### Changed
- Redux Toolkit works without `serializableCheck.ignoredActions`: actions no longer carry functions
- `REHYDRATE`'s `err` is a plain `{ name, message }` object
- Persistence state (paused, purged, read failures) is per store
- `PERSIST`, `PURGE` and `FLUSH` dispatched outside the persistor are ignored (devtools replay no longer throws or purges storage)
- Throttled writes are batched into one write per interval

### Fixed
- Stored data is no longer overwritten with initial state after a failed or timed-out read (#809)
- 5-second hang and timeout error on first run with empty storage
- Crash when the whole state can't be serialized (#1485)
- Throttle starving writes or taking N × throttle to save (#720, #1171)
- Spurious timeout errors from repeated `persist()` (#1107)
- "failed to create sync storage" during server rendering (#1208, #1464)
- `PersistGate` flashing `loading` when already rehydrated (#1070), and "cannot be used as a JSX component" with two copies of `@types/react` (#1375)
- A store with preloaded `_persist` (server-rendered state) never bootstrapping
- Writes stopping after a transform throws, or after hot reloading the reducer

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
