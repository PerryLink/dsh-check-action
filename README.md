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

1. Runs the DSH checker (`dsh-standards`, pinned to a commit) in static ENTRY mode.
2. Reads its additive `advice[]` (dsh-standards 1.2.0+): one fix and one guide URL
   per finding. If the checker has no `advice` (an older pin), it falls back to
   the built-in `rules/entry.json` cards — no error, same advisory output.
3. Writes the report to the job summary, and posts or updates one sticky comment
   per pull request. Fork pull requests get the summary only, because the token
   there is read-only.

## What it does not do

- It does **not** install or execute your plugin. ENTRY only.
- It does **not** run FLOW (journeys) or BOOST (evidence cards); those stay `not-run`.
- It is **not** official, not a certification, and does not rank anything.
- `fail-on: none` (default) never blocks a merge; `fail-on: entry` only fails on a hard ENTRY failure.

## Pinning

The checker is fetched from `PerryLink/dsh-standards` at a pinned commit
(`DSH_CHECKER_REF` in `action.yml`): **v1.2.0 /
`074349b1216a2c99fc49e6c4b6d7fc6a412367c1`**. The full commit is used so a
moved tag cannot change the result, and the action runs on **Node 24**.
