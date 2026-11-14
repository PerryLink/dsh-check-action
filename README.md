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
          # host-version: 0.2.2-rc.3
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
| `host-version` | `''` | Optional dsh version the host runs, used for the C-2 anchor. Unset ⇒ C-2 is NA, not a pass. |

### `host-version`

Optional. It sets the dsh version used for the C-2 (`engines.dsh`) anchor.

**Unset means C-2 is not judged — that is NA, not a pass.** The action does not
install a host, and a GitHub-hosted runner normally has no `dsh` on PATH, so the
checker's best-effort `dsh --version` probe finds nothing and records `DSC-02`
as `NA` (compatibility not judged). A wrong `engines.dsh` range therefore does
**not** fail the run under the default configuration, and `fail-on: entry` does
not catch it. Set `host-version` (or the `DSH_HOST_VERSION` environment
variable) when you want compatibility judged; for the current line use
`0.2.2-rc.3` (npm `next`; `latest` is still `0.2.2-rc.1`).

The pinned 1.6.12 checker has `--host-version`. The action probes the checker's `--help` and forwards `--host-version` when present, otherwise `--runtime-version` (the same anchor under an older name). If the checker accepts neither flag the input is ignored, a note is printed to the action log, and the checker's own host probe (or fallback anchor) applies.

## Outputs

| output | meaning |
|---|---|
| `markdown` | The rendered markdown report (the same text written to the job summary). |
| `advice` | The checker's `advice[]` as a JSON array; `[]` when the pinned checker is too old to emit advice. |

## What it does not do

- It does **not** install or execute your plugin. ENTRY only.
- It does **not** judge `engines.dsh` compatibility unless you pass `host-version`:
  with no host version the C-2 anchor is unknown and `DSC-02` is `NA`, not a pass.
- It does **not** run FLOW (journeys) or BOOST (evidence cards); those stay `not-run`.
- It is **not** official, not a certification, and does not rank anything.
- The report is **advisory**: WARN does not fail, and `fail-on: none` (the default)
  never blocks a merge. `fail-on: entry` only fails on a hard ENTRY failure.

## Pinning

The checker is fetched from `PerryLink/dsh-standards` at a pinned commit
(`DSH_CHECKER_REF` in `action.yml`): **v1.6.12 /
`711f69e6347ed90b24d8a15f288c429d9042039d`**. The full commit is used so a
moved tag cannot change the result, and the action runs on **Node 24**.

1.6.12 adds the reserved capability ids for the rc3 host seams
(`computer:control`, `mcp:manage`, `session-log:egress`, …): declaring one is
accepted (never an unknown-id failure) and reported as not-run, not as an
over-declaration WARN. The selftest pins that surface, so a regression in the
checker or a downgrade of this pin fails the workflow.

The action itself is consumed at the annotated `v1` tag; pin a commit if you
need a fully immutable reference.

## Toolchain and upstream (facts, 2026-11)

- This Action runs the pinned `dsh-standards` ENTRY checker in advisory mode by default.
- Upstream: `dsh-plugin-hub` main includes a version-aware npm metadata check ([`4f3a560`](https://github.com/dshplugin/dsh-plugin-hub/commit/4f3a560), 2026-11-09); scope is install-time npm metadata only; it does not run ENTRY and is not an endorsement.
