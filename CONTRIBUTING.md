# Contributing

Issues and pull requests are welcome. Triage is ongoing in
[#1486](https://github.com/endograph/redux-persist/issues/1486).

```sh
npm ci
npm run lint
npm test
```

## Never break stored data

API changes are fine in a major version. Changes to what's stored are not:
every version must read data written by v5 and v6 without a migration step, and
write the same format. Users lose their saved state if this breaks, and the app
developer never sees an error.

`tests/storageCompat.spec.ts` enforces this against bytes recorded from the
published packages. If it fails, fix the code, not the fixtures. See
[docs/storage-format.md](docs/storage-format.md) for the format and how to add
fixtures.

## Pull requests

- Keep each pull request to one change, with tests that fail without it.
- Pull requests are merged with a merge commit, so your commits keep your
  authorship.
