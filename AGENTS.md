# AGENTS.md

- **Stored data:** users' saved state lives on their devices, so before changing anything that touches what's stored, read "Never break stored data" in [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/storage-format.md](docs/storage-format.md).
- **Pull requests:** follow [CONTRIBUTING.md](CONTRIBUTING.md#pull-requests), and run what CI runs ([.github/workflows/ci.yml](.github/workflows/ci.yml)) before opening one. Name any dependency change, dev dependencies included, in the description. When porting someone's pull request, credit them with `Co-authored-by`.
- **Releasing:** a merge never publishes. Pushing a `v*` tag starts the publish workflow, which waits for a maintainer to approve the `npm-publish` environment. Push tags and approve publishes only when a maintainer asks; the steps are in [CONTRIBUTING.md](CONTRIBUTING.md#releasing).
