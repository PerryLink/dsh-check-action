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
      - id: dsh
        uses: PerryLink/dsh-check-action@v1
        with:
          path: .
          comment: true
          fail-on: none   # advisory by default
          # host-version: 0.2.2-rc.1
```

## What it does

1. Runs the DSH checker (`dsh-standards`, pinned to a commit) in static ENTRY mode.
2. Reads its additive `advice[]` (the 1.2 release and later): one fix and one guide URL
   per finding. If the checker has no `advice` (an older pin), it falls back to
   the built-in `rules/entry.json` cards — no error, same advisory output.
3. Writes the report to the job summary and exposes it as the `markdown` output.
   The checker's raw `advice[]` entries are exposed as the `advice` output
   (a JSON array; `[]` when the pinned checker does not emit advice).
4. On pull requests from the same repository it posts or updates one sticky
   comment. **Fork pull requests get the job summary only**: the token there is
   read-only, so the comment step is skipped instead of failing.

## Inputs

| input | default | meaning |
|---|---|---|
| `path` | `.` | Path to the plugin package inside the repository. |
| `comment` | `true` | Post or update a sticky pull-request comment (same-repo PRs only). |
| `fail-on` | `none` | `none` keeps the run advisory; `entry` fails the job on a hard ENTRY failure. |
| `host-version` | `''` | Optional dsh version the host runs, used for the C-2 anchor. |

### `host-version`

Optional. It sets the dsh version used for the C-2 (`engines.dsh`) anchor.

The pinned 1.6.8 checker has `--host-version`. The action probes the checker's `--help` and passes `--host-version` when present, so an older pin still works. This action
forwarded verbatim, otherwise the value is forwarded as `--runtime-version`.
If the checker accepts neither flag the input is ignored, a note is printed to
the action log, and the checker's own host probe (or fallback anchor) applies.
Unset by default, so behaviour is unchanged.

## Outputs

| output | meaning |
|---|---|
| `markdown` | The rendered markdown report (the same text written to the job summary). |
| `advice` | The checker's `advice[]` as a JSON array; `[]` when the pinned checker is too old to emit advice. |

## What it does not do

- It does **not** install or execute your plugin. ENTRY only.
- It does **not** run FLOW (journeys) or BOOST (evidence cards); those stay `not-run`.
- It is **not** official, not a certification, and does not rank anything.
- The report is **advisory**: WARN does not fail, and `fail-on: none` (the default)
  never blocks a merge. `fail-on: entry` only fails on a hard ENTRY failure.

## Pinning

The checker is fetched from `PerryLink/dsh-standards` at a pinned commit
(`DSH_CHECKER_REF` in `action.yml`): **v1.6.8 /
`6c3d5253f2d624c980383622fc2aa7c5e55dbeae`**. The full commit is used so a
moved tag cannot change the result, and the action runs on **Node 24**.

The action itself is consumed at the annotated `v1` tag; pin a commit if you
need a fully immutable reference.
