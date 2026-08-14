# Release

1. Bump `version` in `package.json`.
2. Add a `CHANGELOG.md` section for that version.
3. Commit, then tag and push:

```sh
git tag v0.1.0
git push origin main --tags
```

The `Release` workflow publishes to npm when the version is new, and creates a GitHub Release.

Required repository secret:

- `NPM_TOKEN` — npm granular access token with read/write for `dsh-mcp-adapter`

The workflow uses the `npm` GitHub Environment.
