# dsh-check-action

Read-only **ENTRY** checks for a DSH plugin, with deterministic suggestions.
No model calls, so a run costs no tokens — only GitHub Actions minutes.

```yaml
name: DSH check
on: [pull_request]
permissions:
  contents: read
  pull-requests: write
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: PerryLink/dsh-check-action@v1
        with:
          path: .
          comment: true
          fail-on: none   # advisory by default
```

## What it does

1. Runs the DSH checker (`dsh-standards`, pinned to a commit) in static mode.
2. Maps each finding to a short rule card: why it matters, how to fix it, a guide anchor.
3. Posts or updates one sticky comment per pull request.

## What it does not do

- It does **not** install or execute your plugin. ENTRY only.
- It does **not** run FLOW (journeys) or BOOST (evidence cards); those stay `not-run`.
- It is **not** official, not a certification, and does not rank anything.
- `fail-on: none` (default) never blocks a merge; `fail-on: entry` only fails on a hard ENTRY failure.

## Pinning

The checker is fetched from `PerryLink/dsh-standards` at a pinned commit
(`DSH_CHECKER_REF` in `action.yml`), so results are reproducible and do not
depend on npm's latest tag.
