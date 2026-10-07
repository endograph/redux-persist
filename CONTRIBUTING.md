# Contributing

Bug reports and pull requests are welcome. For questions and feature ideas,
use [Discussions](https://github.com/endograph/redux-persist/discussions).

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
- Add a line for user-facing changes to CHANGELOG.md, under the unreleased
  version.
- Pull requests are merged with a merge commit, so your commits keep your
  authorship.

## Releasing

Publishing happens in `.github/workflows/publish.yml`, which runs when a `v*`
tag is pushed. Merging to master never publishes.

1. Open a pull request that only sets the version, and merge it. The changelog
   lines come with each change's own pull request.
   ```sh
   npm version <version> --no-git-tag-version
   npm publish --dry-run --tag next  # optional: check the package; drop --tag for a stable version
   ```
2. Tag the merge commit and push the tag. A ruleset restricts tag creation, so
   this takes an admin.
   ```sh
   git checkout master && git pull --ff-only
   git tag -a v<version> -m "<version>"
   git push origin v<version>
   ```
   The tag has to match the version in `package.json`, or the workflow stops
   before publishing.
3. In the run that starts (Actions → "Publish to npm"), approve the
   `npm-publish` environment under "Review deployments". The workflow lints,
   builds and tests, then publishes with provenance: versions with a `-` (like
   `7.0.0-beta.2`) go to the `next` dist-tag, the rest to `latest`.
4. Check `npm view redux-persist dist-tags`, and post the release notes in
   [Announcements](https://github.com/endograph/redux-persist/discussions/categories/announcements).
