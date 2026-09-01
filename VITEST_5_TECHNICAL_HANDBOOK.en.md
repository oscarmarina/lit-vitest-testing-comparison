# Vitest 5: Maintainer-Level Technical Handbook

## Beta.1 through rc.4

**Audience:** library and framework authors who need to reason about Vitest's
execution model, not just consume its public API.

**Evidence policy:** statements about a release change are grounded in the PR/commit,
tagged source, tests, or documentation recorded in
[the local v5 release ledger](./vitest-v5.0.0.md). Where a PR's public discussion
does not establish a rationale, this handbook labels the conclusion as an inference
from the implementation rather than attributing it to maintainers.

## Table of contents

1. [Architecture and runtime ownership](#1-architecture-and-runtime-ownership)
2. [Breaking API and configuration contract](#2-breaking-api-and-configuration-contract)
3. [Browser Mode: protocol, locators, diagnostics, traces, and screenshots](#3-browser-mode-protocol-locators-diagnostics-traces-and-screenshots)
4. [Mocking: transform, registry, and lifecycle](#4-mocking-transform-registry-and-lifecycle)
5. [Reporters, artifacts, snapshots, and UI](#5-reporters-artifacts-snapshots-and-ui)
6. [Coverage and process boundaries](#6-coverage-and-process-boundaries)
7. [Expect API, timers, and benchmark API](#7-expect-api-timers-and-benchmark-api)
8. [Reliability, diagnostics, and performance catalog](#8-reliability-diagnostics-and-performance-catalog)
9. [Large-repository migration runbook](#9-large-repository-migration-runbook)
10. [Appendices](#10-appendices)

---

# 1. Architecture and runtime ownership

Vitest 5's architectural center of gravity moves inward. The runner and benchmark
systems stop being neighbouring products with public package boundaries and become
parts of Vitest's own runtime/task model. That change explains otherwise separate
release notes: benchmark API redesign (#10113), `@vitest/runner` removal (#10511),
multi-environment report merging (#10031), the new test-module diagnostics (#10516),
and several runner/pool correctness fixes all operate on the same ownership boundary.

## 1.1 Dependency map

```text
CLI / createVitest
      │ resolves projects and serializes config
      ▼
Vitest node core ── pools ── worker RPC ── runtime worker
      │                                │
      │                                ├─ module runner / Vite transform graph
      │                                └─ runtime/runner/{collect,run,suite,hooks}
      ▼
state + reported task graph ── reporters / blob serialization / UI
      ▲
browser orchestrator ─ iframe tester ─ same runtime runner task types
```

The key point is not that code was moved. It is that task collection and task
execution are now owned by the package which owns the module runner, project model,
and public runtime. Browser Mode no longer needs to depend on a separately shipped
runner package merely to agree with Node execution about a `Task`, suite hierarchy,
fixture lifecycle, or reported task.

## 1.2 Inline `@vitest/runner` (#10511, beta.5)

### Executive summary

Vitest removes `@vitest/runner` as a published package and relocates its implementation
under `packages/vitest/src/runtime/runner/`. The public effect is a package-boundary
break; the architectural effect is a single runtime implementation shared by Vitest,
the browser tester, reporters, custom-runner integration, and task utilities.

### Motivation and previous model

Before v5, `packages/runner` owned runner implementation, runner types, collection
utilities, task utilities, and its own build/public surface. `packages/vitest` then
imported it across a monorepo package boundary. That looked modular, but it made the
most version-sensitive internal contracts independently publishable. The browser
package and UI also had to consume the same task vocabulary through package imports.

The previous public shape permitted code such as:

```ts
// package.json
{
  "dependencies": { "@vitest/runner": "^4.0.0" }
}

// custom-runner.ts
import { VitestTestRunner } from '@vitest/runner'
```

That import implies a compatibility promise for collection internals, task maps,
hooks, and runner types. The v5 implementation makes the opposite decision: these
are Vitest internals, so their lifecycle must follow `vitest` exactly.

### Implementation walk-through

Commit `6d6e46b1` removes the runner package's package manifest, rollup config,
README, declarations, public index, and utility entry points. It moves the operational
files almost verbatim into `packages/vitest/src/runtime/runner/`:

```text
packages/runner/src/{collect,run,suite,hooks,fixture,...}
                  ↓
packages/vitest/src/runtime/runner/{collect,run,suite,hooks,fixture,...}
```

It then changes all consumers to import through Vitest-local runtime paths. This is
not a cosmetic rename: the commit also consolidates task helpers in
`packages/vitest/src/utils/tasks.ts` and expands `runtime/runner/types.ts` so the
runtime owns the type graph it executes. The changed consumers include the browser
orchestrator/tester, all Node reporters, the module diagnostic path, worker startup,
VM runners, typecheck, snapshot/expect integration, and custom-runner tests.

The execution flow after the move is:

```text
Vite transforms a test module
  -> Vitest AST/runtime collection creates the suite/task graph
  -> runtime/runner executes hooks, fixtures, tests, and child tasks
  -> worker serializes task updates/results over RPC
  -> Node state records modules/tasks
  -> reporters, UI, and blob merger consume that one task representation
```

The source rename list in the commit is particularly important to contributors:
`artifact.ts`, `collect.ts`, `context.ts`, `errors.ts`, `fixture.ts`, `hooks.ts`,
`map.ts`, `run.ts`, `setup.ts`, `suite.ts`, `test-state.ts`, and chain/suite/tag
utilities all moved together. A change to task collection therefore has runtime and
reporter consequences even when its diff initially appears to concern only a test API.

### API and migration impact

`@vitest/runner` is deprecated/not published as the supported implementation package.
Do not replace it with a deep `vitest` import: internal paths are deliberately not a
compatibility boundary. A custom runner should use the documented `TestRunner` surface
from `vitest`/`vitest/node` appropriate to the extension point, pin Vitest as a peer
dependency, and treat the v5 migration as a source migration rather than a lockfile
upgrade.

For an ecosystem package, test this failure explicitly:

```bash
rg -n "@vitest/runner|vitest/(runners|suite)" .
pnpm why @vitest/runner
```

The removal is connected to #10222, which deletes old Vitest entry points
(`vitest/coverage`, `vitest/reporters`, `vitest/environments`, `vitest/snapshot`,
`vitest/runners`, `vitest/suite`, `vitest/mocker`, and `vitest/internal/module-runner`).
Both changes reduce accidental dependency on implementation topology.

### Tests and design evidence

#10511 modifies custom-runner fixtures, public API tests, runner tests, reporter
tests, browser tests, no-dispose DTS fixtures, and typecheck fixtures. That breadth
is evidence that the risk was contract propagation rather than algorithm novelty.
The migration guide lists the package as deprecated and directs consumers away from
the package boundary. No public RFC is linked by the PR; this chapter does not infer
one.

**References:** [PR #10511](https://github.com/vitest-dev/vitest/pull/10511),
[commit `6d6e46b1`](https://github.com/vitest-dev/vitest/commit/6d6e46b1),
[v5 migration guide at beta.6](https://github.com/vitest-dev/vitest/blob/v5.0.0-beta.6/docs/guide/migration.md).

## 1.3 Benchmark execution becomes an ordinary test fixture (#10113, beta.4)

### Executive summary

The old module-scope `bench()` API and separate benchmark mode are replaced with a
`bench` fixture supplied to a normal `test()` in a benchmark file. A registration is
explicitly executed by `.run()` or composed by `bench.compare()`. Results become task
data consumed by normal reporters, not a parallel reporting subsystem.

### Why the old architecture was insufficient

The PR explicitly links [Discussion #7850](https://github.com/vitest-dev/vitest/discussions/7850)
and describes the intended inversion: benchmark is part of a test, rather than itself
being a test. Public review is unusually clear here: the maintainers characterize the
old implementation as an "addition" rather than built-in and approve removal of the
separate `mode` abstraction. That is the design rationale, not a guess from API taste.

Under the old model, benchmark collection, runner selection, CLI mode, specialized
reporters, output JSON, and comparison files were coupled. This made it hard to share
fixtures/hooks, use retries/assertions naturally, or report a benchmark through the
normal task/report pipeline.

```ts
// v4: a module-scope benchmark is the executable unit
import { bench } from 'vitest'

bench('parse', () => JSON.parse('{"a":1}'))
```

The v5 model makes the test boundary own lifetime, retry behavior, filtering, and
assertions:

```ts
import { expect, test } from 'vitest'

test('parse is faster than custom parser', async ({ bench }) => {
  const result = await bench.compare(
    bench('JSON.parse', () => JSON.parse('{"a":1}')),
    bench('custom parser', () => customParse('{"a":1}')),
    { iterations: 100, time: 1_000 },
  )

  expect(result.get('JSON.parse')).toBeFasterThan(result.get('custom parser'))
})
```

The file must match `benchmark.include` (by default a `.bench.*`/`.benchmark.*`
filename). The fixture is intentionally unavailable in a normal test file: file
selection decides whether a project is a benchmark project; use of the fixture does
not silently change the project's semantics.

### Internal implementation

The PR is a 136-file rewrite, adding `runtime/benchmark.ts` (565 added lines), a Chai
integration for performance matchers, node-side benchmark result handling, a generic
benchmark-table renderer, config/project plumbing, browser RPC support, a new 480-line
guide, and a large end-to-end/DTS test rewrite. It deletes the old benchmark runner and
the old specialised benchmark reporter directory.

At runtime `createBench(test, config)` owns a registration set for *one test*. A call
to `bench(name, fn)` registers a lazy `Tinybench` task. `.run()` materializes a
Tinybench instance with the current test's `AbortSignal`; `bench.compare()` loads all
registrations into one Tinybench execution, so its interleaving is meaningful. The
result is serialized into `test.benchmarks`, sent through worker RPC with
`onTestBenchmark`, and rendered by standard reporter paths.

```text
test callback receives bench fixture
    -> bench(...) registers one or more candidate tasks
    -> run()/compare() executes Tinybench under the test AbortSignal
    -> benchmark result is normalized into TestBenchmark / TestBenchmarkTask
    -> worker RPC reports it as test-associated data
    -> base/json/default reporters render the same task graph
```

`bench.from()` supplies a stored baseline rather than a callable function, while
`writeResult` persists a successful result. `perProject` marks a task to be aggregated
after project runs. The implementation substitutes `${projectName}` only during result
path resolution and rejects a missing stored baseline instead of treating it as a
silent empty comparison. `getter-tracker` resets around benchmark execution to detect
exports whose getters are invoked excessively - an important signal because getter
overhead can dominate a microbenchmark.

`toBeFasterThan`/`toBeSlowerThan` validate the result shape, compare mean latency,
and support a `delta` threshold. Their API deliberately exposes standard assertions
for absolute thresholds too; neither matcher converts a noisy measurement into a
stable environmental guarantee.

### Removed surface and migration risks

| v4 surface | v5 replacement | Consequence |
| --- | --- | --- |
| module-scope `bench` | `test(..., async ({ bench }) => ...)` | Benchmark has test lifecycle |
| `bench.skip/only/todo` | `test.skip/only/todo` | Filtering sits at test boundary |
| `benchmark.reporters/outputFile` | top-level reporters / `--outputFile` | One reporting system |
| `benchmark.compare`, `--compare` | `writeResult`, `bench.from`, `bench.compare` | Stored baseline is explicit |
| `benchmark.outputJson`, `--outputJson` | JSON reporter | Benchmarks appear in ordinary JSON task output |
| `Vitest.mode === 'benchmark'` | always `'test'` | Benchmark is a dedicated project, not instance mode |

Do not put workload setup accidentally inside the measured callback. Put fixture setup
in benchmark options (`beforeEach`, `beforeAll`) when it must not be measured; use a
per-benchmark `writeResult` only in a controlled, comparable environment. CI should
run performance assertions with a delta and a stable runner class, then retain the
raw JSON report for diagnosis.

**References:** [PR #10113](https://github.com/vitest-dev/vitest/pull/10113),
[Discussion #7850](https://github.com/vitest-dev/vitest/discussions/7850),
[commit `19f6e894`](https://github.com/vitest-dev/vitest/commit/19f6e894),
[benchmark guide at beta.6](https://github.com/vitest-dev/vitest/blob/v5.0.0-beta.6/docs/guide/benchmarking.md),
[runtime implementation](https://github.com/vitest-dev/vitest/blob/v5.0.0-beta.6/packages/vitest/src/runtime/benchmark.ts).

## 1.4 Report merging is a task-identity problem (#10031, beta.2)

### Executive summary

`--merge-reports` is extended to non-sharded multi-environment runs. The feature is
not file concatenation: it must reconstruct the reported task/module graph across
projects and potentially different project roots, then give reporters/UI a complete
identity-consistent run.

### Internal consequences

#10031 changes collection, suite construction, AST collection, typecheck collection,
project/config serialization, state, `TestSpecification`, `TestRun`, browser
orchestrator state, blob reporter, base/summary reporters, and UI explorer views. The
477-line merge-reports end-to-end test expansion is the strongest available evidence
of the intended cases: non-sharded environments are not merely a second shard label.

The later fixes explain the invariants the first feature established:

* #10318 serializes a module whose import subpath does not exist.
* #10346 prevents a report label from corrupting the blob filename.
* #10348 retains `testModules` in `onTestRunEnd` when blobs originate in different
  root directories.
* #10338 preserves source metadata for that same different-root case in HTML output.
* #10570/#10578 calculate transform time correctly after merge.

Treat a merged blob as serialized run state with module/task references, source
metadata, timings, and environment identity. A merger that is correct only for
path-identical sharded jobs will still produce plausible but incomplete HTML/UI output.

### Practical contract

Adopt the `.vitest/blob` default (#10232) together with `createReport` (#9993), and
make report collection a CI artifact step rather than scraping console output. All
agents that will merge must use a compatible Vitest version and preserve their
artifact trees. Test a matrix containing at least two project roots and two
environments; inspect both JUnit/JSON and HTML/UI output, not only exit status.

**References:** [PR #10031](https://github.com/vitest-dev/vitest/pull/10031),
[PR #9993](https://github.com/vitest-dev/vitest/pull/9993),
[PR #10348](https://github.com/vitest-dev/vitest/pull/10348),
[PR #10338](https://github.com/vitest-dev/vitest/pull/10338),
[commit `e60b2f49`](https://github.com/vitest-dev/vitest/commit/e60b2f49).

## 1.5 Architecture-specific migration checklist

- Remove direct dependencies on `@vitest/runner` and deleted `vitest/*` entry points.
- Convert benchmark files to the fixture API; preserve `.bench.*` discovery and await
  `.run()` / `bench.compare()`.
- Treat benchmark output as standard reporter output; remove retired benchmark
  reporter/compare/output JSON configuration.
- Store blobs, report output, and attachments as build artifacts under `.vitest`.
- Validate merge output with distinct project roots/environments, including source
  links and module totals.
- Update reporter code which interprets worker IDs: they are 1-based in v5 and
  `TestModule.diagnostic()` now also exposes `concurrencyId`.

---

# 2. Breaking API and configuration contract

Vitest 5 turns several formerly permissive conventions into explicit contracts. The
changes share a direction: configuration must have a determinate owner; runtime
semantics must have one polarity; generated output must be isolated and discoverable;
and publicly importable implementation detail must not be mistaken for supported API.

This chapter covers #10178, #10198, #10194, #10186, #10334, #10428, #10222, #10221,
#10511, #10373, #10516, #10620, #10621, #10583, #10293, #10651, and the related
configuration/reporting fixes recorded in the research ledger.

## 2.1 Platform floor: Node 22 and Vite 6.4 (#10178, beta.3)

### Executive summary

Vitest 5 requires Node.js 22.12.0 or newer and Vite 6.4.0 or newer. This is a hard
support boundary, not an advisory peer-dependency range: a project that keeps an
older runtime is outside the version's tested execution model.

### Why this is architectural

Vitest owns a Vite server/module graph, uses Node worker/process pools, serializes
Vite-derived configuration into workers and browser clients, and must maintain a
single transformation/runtime contract. Supporting older Vite versions would create
different plugin/config semantics beneath the same Vitest API. Supporting older Node
would multiply worker, VM, coverage, inspector, globals, and package-resolution
compatibility paths. The source repository's root documentation and migration guide
make the floor part of the product contract.

The Node floor also contextualises #10293: Node 26's lazy `localStorage` behavior can
throw while global properties are inspected, and a worker that cannot start must yield
a normal Vitest error rather than a follow-on crash. Do not read that bug fix as a
claim of Node 26 support alone; it is defensive handling at the global/worker startup
boundary.

### Migration

```json
{
  "engines": {
    "node": ">=22.12.0"
  },
  "devDependencies": {
    "vite": "^6.4.0 || ^7.0.0 || ^8.0.0",
    "vitest": "5.0.0-beta.6"
  }
}
```

Pin the CI image before changing Vitest. Verify every workspace's resolved Vite,
including packages which list Vite as a peer dependency:

```bash
node --version
pnpm -r why vite
pnpm -r exec vitest --version
```

Library authors should advertise a Vitest peer range only when their exported helper
uses Vitest APIs; application test configuration belongs in dev dependencies. Do not
try to shim old Node/Vite with aliases: the runner's invariants are wider than imports.

**References:** [PR #10178](https://github.com/vitest-dev/vitest/pull/10178),
[commit `3876283e`](https://github.com/vitest-dev/vitest/commit/3876283e),
[migration prerequisites](https://github.com/vitest-dev/vitest/blob/v5.0.0-beta.6/docs/guide/migration.md).

## 2.2 One concurrency vocabulary (#10198 and #10194, beta.2)

### Executive summary

`test.sequential`, `describe.sequential`, and `{ sequential: true }` are removed.
Use the existing `concurrent` flag with the opposite boolean when a task/suite must
override inherited or global parallelism: `{ concurrent: false }`.

### Previous behavior and failure mode

Two negated ways of describing ordering made option merging unnecessarily subtle:

```ts
// v4: two APIs describe the same scheduling intent
describe.sequential('database', () => {
  test.sequential('writes', write)
})

test('global override', { sequential: true }, serial)
```

This is not just syntax. A global `sequence.concurrent: true` and a local sequential
option require an unambiguous precedence rule. #10194 adds regression coverage for
the specific case where a top-level `test(..., { concurrent: false })` must override
the global setting. #10198 removes the deprecated parallel spelling after the rule is
expressible in the surviving API.

```ts
// v5: concurrency is the only axis and false explicitly opts out
describe('database', { concurrent: false }, () => {
  test('writes', { concurrent: false }, write)
})

export default defineConfig({
  test: { sequence: { concurrent: true } },
})
```

### Internal and ecosystem impact

The runner stores chainable flags during collection and merges task/suite options
before it schedules callbacks. That is why adjacent fixes matter: #10187 propagates
chainable flags through `describe.for`; #10179 limits concurrency per task branch in
addition to leaf callbacks; #10216 fixes inherited suite options in the task API; and
#10659 fixes a per-project `sequence` configuration leak. The public migration is a
rename, but the internal objective is to ensure collection metadata describes the
same tree that the scheduler later executes.

For a monorepo, migrate all aliases before altering global scheduling. A mechanical
search is safe, but semantic verification is still required for nested suites:

```bash
rg -n "\.(sequential)\(|\bsequential\s*:" --glob '*.{ts,tsx,js,jsx,mts,cts}'
```

Replace only test/suite APIs. Do not rewrite unrelated application properties called
`sequential`. Then add a regression suite that records starts/ends under the exact
project/sequence configuration used in CI.

**References:** [PR #10198](https://github.com/vitest-dev/vitest/pull/10198),
[PR #10194](https://github.com/vitest-dev/vitest/pull/10194),
[PR #10179](https://github.com/vitest-dev/vitest/pull/10179),
[PR #10659](https://github.com/vitest-dev/vitest/pull/10659).

## 2.3 Configuration discovery has a bounded root (#10428, beta.5)

### Executive summary

When `vitest` starts in a subdirectory, it no longer walks ancestor directories to
find a config file. Configuration ownership is the explicit `--config` path or the
current/root invocation context.

### Previous and new behavior

```text
repo/
  vitest.config.ts
  packages/widget/
```

```bash
# v4: could silently adopt repo/vitest.config.ts
cd repo/packages/widget && vitest

# v5: make ownership explicit
cd repo/packages/widget && vitest --config ../../vitest.config.ts --dir .
```

The old ascent is especially dangerous in a workspace: a package-level invocation
can collect a parent project's aliases, setup files, projects, coverage thresholds,
browser server options, and output paths without the command line revealing that
fact. #10428 changes `resolveConfig`, public config plugin handling, creator paths,
and CLI config tests; it is a discovery-boundary change, not simply a file lookup
optimization.

### Migration and CI validation

Make every package script self-contained. Prefer invoking from the repository root
with an explicit filter/config, or use a package-local configuration file. Add a CI
job that executes the exact working directory used by editors/task runners; do not
only test the root script. For generated configs, resolve their path relative to the
calling script, not process ancestry.

**References:** [PR #10428](https://github.com/vitest-dev/vitest/pull/10428),
[commit `945d9090`](https://github.com/vitest-dev/vitest/commit/945d9090).

## 2.4 `.vitest` is the artifact namespace (#9993, #10186, #10232, #10620, #10621)

### Executive summary

Vitest converges generated test artifacts at `<project-root>/.vitest`. Attachments,
blob reports, the HTML report, JSON output, and JUnit output each receive predictable
subpaths. This is a breaking filesystem and CI contract.

### Complete default transition

| Producer | Previous/default behavior | v5 default |
| --- | --- | --- |
| attachments (#10186) | `.vitest-attachements/` (misspelled) | `.vitest/attachments/` |
| blob / merge (#10232) | `.vitest-reports/blob-*.json` | `.vitest/blob/blob-*.json` |
| HTML (#10620) | `html/index.html` | `.vitest/index.html` |
| JSON (#10621) | stdout | `.vitest/json/output.json` |
| JUnit (#10621) | stdout | `.vitest/junit/output.xml` |

#9993 provides `createReport` and establishes the report-root convention. #10334 then
makes `attachmentsDir` root-only: it cannot vary per project because artifact lookup,
reporting, and cleanup need a shared owner. #10232 moves the blob reporter and
`--merge-reports` into the same namespace. The final beta moves user-facing
reporters, converting console-stream assumptions into file artifacts by default.

This is a design for composable CI rather than terminal-only output:

```text
test worker / browser command
       -> attachment or reporter result
       -> <root>/.vitest/<producer>/...
       -> CI uploads one artifact tree
       -> a merge/report job consumes it
```

### Migration

```gitignore
# one rule covers Vitest's generated state and reports
.vitest/
```

```ts
// Preserve a stdout JSON pipeline only where a downstream command requires it.
export default defineConfig({
  test: {
    reporters: [['json', { stdout: true }]],
  },
})
```

Otherwise, replace `vitest --reporter=json | jq` with `jq . .vitest/json/output.json`.
When an existing CI uploader expects `coverage/` or `html/`, update the path and add
the artifact tree to job outputs. Be wary of concurrent runs: #10466 makes colliding
`coverage.reportsDirectory` fail fast, a complementary rule that prevents one run
from deleting or overwriting another's coverage files.

### HTML reporter option migration

The HTML output change also shifts its option model from `outputFile` (a file) to
`outputDir` (a directory), while #10235 adds a deliberate single-file-output mode.
Choose the former when hosting an asset directory; choose the latter for an artifact
viewer/email-like attachment. Do not assume that `outputFile` keeps selecting an
index document in v5.

**References:** [PR #9993](https://github.com/vitest-dev/vitest/pull/9993),
[PR #10186](https://github.com/vitest-dev/vitest/pull/10186),
[PR #10232](https://github.com/vitest-dev/vitest/pull/10232),
[PR #10620](https://github.com/vitest-dev/vitest/pull/10620),
[PR #10621](https://github.com/vitest-dev/vitest/pull/10621),
[PR #10466](https://github.com/vitest-dev/vitest/pull/10466).

## 2.5 Public package and entry-point contraction (#10221, #10222, #10511, #10675)

### Executive summary

v5 inlines `@vitest/expect` and `@vitest/runner`, removes deprecated `vitest/*`
entry points, and removes the built-in WebdriverIO provider package. The supported
surface is narrower and more intentional.

### Exact entry-point migration

| Removed import | Supported replacement |
| --- | --- |
| `vitest/coverage`, `vitest/reporters` | `vitest/node` |
| `vitest/environments`, `vitest/snapshot` | `vitest/runtime` |
| `vitest/runners` | `TestRunner` from `vitest` |
| `vitest/suite` | static `TestRunner` methods from `vitest` |
| `vitest/mocker` | `@vitest/mocker` |
| `vitest/internal/module-runner` | no supported replacement |

Inlining `@vitest/expect` (#10221) makes browser expectation code import Vitest's
implementation directly; it does not grant consumers a new internal import contract.
Inlining the runner is explained in Chapter 1. #10675 removes the maintained
`@vitest/browser-webdriverio` package and transfers WebdriverIO support to the
community package; provider-dependent projects must update their dependency and
issue-routing expectations.

Use both source and dependency audits:

```bash
rg -n "from ['\"](vitest/(coverage|reporters|environments|snapshot|runners|suite|mocker|internal/module-runner)|@vitest/(runner|expect|browser-webdriverio))" .
pnpm -r why @vitest/runner @vitest/expect @vitest/browser-webdriverio
```

**References:** [PR #10221](https://github.com/vitest-dev/vitest/pull/10221),
[PR #10222](https://github.com/vitest-dev/vitest/pull/10222),
[PR #10511](https://github.com/vitest-dev/vitest/pull/10511),
[PR #10675](https://github.com/vitest-dev/vitest/pull/10675).

## 2.6 Environment globals and diagnostics IDs (#10373 and #10516)

### DOM global propagation

#10373 changes the jsdom/happy-dom integration so assignment to the test global also
updates the underlying window. That matters when the DOM implementation itself later
reads the property, for example a mocked `innerWidth` used by `matchMedia`.

```ts
// v5: test-global assignment affects the backing DOM window implementation
globalThis.innerWidth = 480
expect(window.matchMedia('(max-width: 500px)').matches).toBe(true)
```

The same environment boundary has a subtler breaking change: `populateGlobal` now
records property descriptors in `originals`, not eagerly read values. Consumers of a
custom environment must restore descriptors with `Object.defineProperty`; assignment
would invoke/set incorrectly for accessors and cannot faithfully restore flags. The
change avoids triggering Node's lazy globals during capture.

### Worker identity

#10516 changes `VITEST_POOL_ID` and `VITEST_WORKER_ID` to 1-based values and adds
`concurrencyId` to `TestModule.diagnostic()`. Never use either identifier as a direct
array index. Use it as an opaque partition key or subtract one at the narrow point
where an index is genuinely required. Browser and Node pool IDs can repeat because
they belong to separate pools.

```ts
onTestModuleEnd(module) {
  const { workerId, concurrencyId } = module.diagnostic()
  publish({ worker: `worker-${workerId}`, concurrencyId })
}
```

**References:** [PR #10373](https://github.com/vitest-dev/vitest/pull/10373),
[PR #10516](https://github.com/vitest-dev/vitest/pull/10516).

## 2.7 UI access is authenticated, not merely hidden (#10583)

### Executive summary

Vitest UI's HTML route and API require an authentication token. A bare `/__vitest__/`
URL is no longer an acceptable capability; users open the tokenized URL emitted by
Vitest, after which the direct route works for that authenticated context.

### Implementation and threat boundary

#10583 adds `packages/vitest/src/node/config/apiToken.ts`, threads token resolution
through creation/config/plugin paths, and changes the UI package's node integration.
The tests cover UI, editor, trace, and streaming helpers because all use the API
surface. The migration guide describes the practical failure mode: a manually opened
UI URL shows an error until authenticated.

This must be read with #10444 (client CDP API disabled when write/exec is forbidden),
#10674 (built-in browser commands check filesystem access), #10522 (orchestrator URL
requires a session ID), and #10412 (escape inline orchestrator scripts). Together,
they define the browser/UI bridge as an access-controlled server capability.

Do not publish a copied tokenized URL, include it in CI logs, or reverse-proxy UI
without preserving the intended access boundary. If a preview workflow needs browser
access, start Vitest in that controlled process and consume its generated URL rather
than hardcoding internal paths.

**References:** [PR #10583](https://github.com/vitest-dev/vitest/pull/10583),
[PR #10444](https://github.com/vitest-dev/vitest/pull/10444),
[PR #10674](https://github.com/vitest-dev/vitest/pull/10674),
[PR #10522](https://github.com/vitest-dev/vitest/pull/10522).

## 2.8 Configuration migration checklist

- Raise Node and Vite before changing Vitest; run the actual CI image locally or in
  an isolated CI job.
- Replace all sequential APIs/options with `concurrent: false`; test nested and
  per-project sequence behavior.
- Make every config path explicit from non-root working directories.
- Ignore and upload `.vitest/`; update every report/artifact consumer and stdout
  parser deliberately.
- Set unique coverage report directories for concurrent jobs.
- Replace removed entry points/packages; migrate WebdriverIO to its community
  provider before updating Browser Mode tests.
- Update custom environments to restore global property descriptors.
- Audit worker-ID-derived resource names/array indexing for the 1-based change.
- Treat UI and browser server URLs as credentials/capabilities, not stable public
  static paths.

---

# 3. Browser Mode: protocol, locators, diagnostics, traces, and screenshots

Browser Mode is not a Node test runner with a remote DOM bolted on. It is a distributed
test system: Vite's Node process owns discovery, sessions, permissions, provider
commands, artifacts, and reporting; an orchestrator page owns iframe lifetime and the
UI bridge; each tester iframe imports/transforms/runs test modules in a real browser;
a provider performs privileged automation. Nearly every Browser Mode beta change is a
correction or hardening of one of those boundaries.

This chapter covers #9745, #10171, #10102, #10212, #10138, #10227, #10218, #10257,
#10302, #10296, #10329, #10283, #9957/#10267, #10355, #10391, #10389, #10412,
#10444, #10386, #10430, #10404, #10437, #10522, #10397, #10497, #10520/#10521,
#10592, #10656, #10626, #10662, #10674, and #10675.

## 3.1 Execution topology and lifecycle

```text
Vitest Node core / Vite server
  │ creates a browser session; resolves project/config; starts provider
  │  RPC: commands, module graph, task events, coverage, artifacts
  ▼
session-bound orchestrator HTML (/__vitest_test__/?sessionId=...)
  │ websocket readiness -> onOrchestratorReady
  │ owns UI, traces, iframe creation and viewport
  ├── isolated: one tester iframe per file, prepare -> execute -> cleanup
  └── non-isolated: one iframe, execute file set -> cleanup after run
  ▼
tester iframe
  │ handshake / readiness; loads Vite-transformed test modules
  │ runs Vitest runtime and Locator API in the actual DOM
  ▼
provider (Playwright, preview, or community WebdriverIO)
  resolves serialized locator selectors; performs filesystem/automation commands
```

`IframeOrchestrator.createTesters()` is the lifecycle coordinator. It waits for trace
initialization, establishes an OpenTelemetry span, clears/reuses iframe state according
to `browser.isolate`, sets viewport, and sends `execute` with file specifications,
method, provided context, `concurrencyId`, and `workerId`. An isolated run cleans each
iframe after its file so resources/coverage can be finalized; a non-isolated run delays
cleanup to preserve shared browser state until all files finish.

That lifecycle explains the startup changes:

* #10522 makes the orchestrator HTML request require `sessionId`; a bare internal URL
  cannot attach to an arbitrary server.
* #10397 waits for orchestrator websocket readiness before resolving a browser session.
* #10497 waits for the tester iframe's readiness before preparation/execution.
* #10656 gives iframe communication a handshake timeout, producing a bounded failure
  rather than an indefinitely pending run.
* #10520/#10521 URL-encode `iframeId`, preventing path/query identity corruption for
  file names with URL-significant characters.

These are ordering contracts. Retrying a failed browser test will not repair a server
that started executing before its receiving peer could process the message; the fix is
the readiness barrier and an explicit timeout.

## 3.2 Locators are two representations, not DOM elements (#10212)

### Executive summary

Browser commands now receive a `SerializedLocator` object rather than a bare string:

```ts
type SerializedLocator = {
  selector: string // provider-consumable selector
  locator: string  // human-readable Vitest/Playwright-style expression
}
```

The first field drives automation. The second retains diagnostic intent for traces and
errors. A string could do only the former.

### Previous and new command contract

```ts
// v4 custom command
export async function click(
  context: BrowserCommandContext,
  selector: string,
) {
  await context.page.locator(selector).click()
}

// v5 custom command
export async function click(
  context: BrowserCommandContext,
  target: SerializedLocator,
) {
  await context.page.locator(target.selector).click()
}
```

Do not replace `target` with `String(target)`: that loses the selector and hides an
incompatible command signature. Update all command type declarations, provider
adapters, test doubles, and trace assertions together.

### Internal implementation

The abstract `Locator` carries a selector, uses an Ivya selector engine configured
from `browser.locators`, and serializes before every remote command. `click`, `fill`,
`hover`, `upload`, screenshot/mark APIs, and selection all route through the command
bridge. A DOM element supplied to selection is converted into a CSS selector and a
human-readable Ivya locator expression, preserving the same dual contract.

```text
page.getByRole(...)
  -> Locator (selector composition remains lazy)
  -> Locator.serialize(): { selector, locator }
  -> command RPC
  -> provider uses selector against real browser page
  -> trace/error/UI renders locator expression
```

The 54-file #10212 diff changes both Playwright and WebdriverIO command adapters,
browser context declarations, screenshots, traces, orchestrator/tester code, UI trace
view, mocker package metadata, and 370 lines of trace tests. That breadth is expected:
the wire format sits across every browser abstraction.

## 3.3 Exactness is deliberate semantic tightening (#10430, #10473, #10626)

`browser.locators.exact` now defaults to `true`. Queries such as `getByText('Save')`
are full, case-sensitive matches unless the caller supplies an intentionally broader
query or changes the configuration. The migration risk is false negatives in tests
that accidentally relied on partial matching; the benefit is that a locator describes
the UI contract being asserted rather than an ambiguous substring.

The expectation layer follows the same rule. `toHaveTextContent` now expects exact
string equality and no longer accepts `RegExp`; partial/regex semantics move to
`toMatchTextContent`:

```ts
await expect.element(page.getByRole('alert'))
  .toHaveTextContent('Saved')

await expect.element(page.getByRole('alert'))
  .toMatchTextContent(/saved/i)
```

Use exactness for stable component copy/ARIA values. Use `toMatchTextContent` when
the product intentionally includes dynamic prefixes, counts, or localized variable
content. Do not globally disable exactness just to retain under-specified tests.

#10626 completes the timeout contract by deriving a strictly positive action timeout.
An action retry loop with zero/negative timeout is neither immediate nor well-defined;
provider implementations need a positive deadline to schedule retry/timeout behavior.

## 3.4 ARIA and Shadow DOM diagnostics (#10171, #10218, #10257, #10227)

Vitest uses Ivya, a Playwright-locator-derived selector/ARIA layer, so a locator error
can report an accessibility-tree view of the actual browser state. #10171 exports its
ARIA utilities; #10218 upgrades Ivya to avoid an empty ARIA snapshot; #10257 surfaces
that tree on locator errors. This changes failure diagnosis from "selector did not
match" to "this is the role/name tree the browser exposed".

The design is especially valuable for Web Components: visible Shadow DOM text and the
accessible tree can diverge; a CSS selector can cross a boundary differently from an
ARIA query. #10227 corrects trace highlighting for Shadow DOM on WebdriverIO. Treat it
as provider rendering parity, not evidence that every shadow-root interaction has
identical provider semantics. Keep provider-specific browser tests for closed roots,
cross-origin frames, and composed accessibility behavior.

## 3.5 Trace protocol, custom marks, and DOM snapshots

Trace entries are structured execution data, not screenshots pasted into a report.
The locator serialisation supplies the element identity; tester code records commands
and marks; orchestrator/UI renders updates; providers can add automation details.

| Change | Effect |
| --- | --- |
| #10102 | trace view can render DOM snapshots |
| #10302 | `page.mark` accepts a custom `kind` |
| #10329 | custom commands can create trace entries with `context.mark` |
| #10296 | watch UI receives live trace updates |
| #10404 | editor panel shows trace steps |
| #10437 | UI renders nested marks |

`Locator.mark(name, options)` only sends work when a current test has active trace
recording/view state. It serializes the locator and preserves a supplied or captured
stack. This avoids command overhead for tests without tracing while allowing custom
commands to create nested, semantically named steps.

```ts
// a provider/custom command can make an application-level trace boundary visible
await context.mark('seed authenticated account', { kind: 'fixture' })
```

Use marks at cross-cutting command boundaries, not for every helper call. The trace is
an incident/debugging artifact; excessive marks obscure the causal sequence and add
serialization/UI work.

## 3.6 Screenshots and visual artifacts (#9745, #10138, #10592)

#9745 fixes iframe scale, a foundational correction because screenshot coordinates
and trace highlights must account for the relationship between orchestrator page,
iframe CSS/layout scale, and provider viewport. #10138 provides the project reference
to `ToMatchScreenshotResolvePath`, making custom path resolution project-aware in a
workspace. #10592 separates reference screenshot placement from general browser
screenshots:

```ts
export default defineConfig({
  test: {
    browser: {
      screenshotDirectory: 'artifacts/screenshots',
      expect: {
        toMatchScreenshot: {
          screenshotDirectory: 'test/__screenshots__',
        },
      },
    },
  },
})
```

Previously a custom `browser.screenshotDirectory` was incorrectly used by reference
matching. v5 makes the ownership explicit: transient/browser screenshots and checked
in expectation baselines are different artifact classes. Move or regenerate existing
baselines after this migration; do not silently point both classes at the same cleanup
directory.

#10278 reduces screenshot-matching overhead. Its performance value is amplified by
the new traces/visual testing workflow: matching must not repeatedly perform expensive
work for each candidate/retry. It does not relax pixel comparison semantics.

## 3.7 Security and provider boundary

The browser bridge exposes real browser/CDP, filesystem, and command capabilities.
v5 makes this explicit:

* #10412 escapes inline orchestrator scripts, closing an HTML/script injection edge.
* #10444 disables client CDP API if `allowWrite` or `allowExec` is false.
* #10674 checks filesystem access in built-in commands, not only at UI entry points.
* #10522 session-binds the orchestrator route; #10583 token-authenticates the UI/API
  (Chapter 2).
* #10391 honours `disableConsoleIntercept` in Browser Mode rather than retaining a
  Node-only interpretation of the option.

For CI, grant the Browser Mode process only the repository/artifact paths it needs.
Do not add permissive `allowWrite`/`allowExec` merely to make a test command work;
write a dedicated command with narrow inputs and validate filesystem access there.

## 3.8 Vite/module graph and watch correctness

The browser runner is Vite-transform driven, so module identity must remain exact.
#10355 skips `wrapDynamicImport` transform in the SSR environment, preventing a
browser-oriented wrapping behavior from corrupting the server path. #9957/#10267
remove an orphaned Playwright route when the same module is mocked using multiple
identities. #10386 fixes the module graph exposed to `--ui`; #10389 invalidates stale
source maps in watch mode. All four are versions of the same invariant: a displayed,
mocked, or reloaded module must refer to the same Vite identity as the executing one.

If a Browser Mode failure reproduces only after a mock edit/watch rerun, inspect the
resolved URL (including query), not just the source import spelling. Test query
imports, aliases, duplicate IDs, and dynamic imports in provider integration suites.

## 3.9 Provider migration: WebdriverIO

#10675 removes Vitest's built-in WebdriverIO package and moves support to the
community-maintained `vitest-community/vitest-webdriverio` project. Earlier beta fixes
remain historically relevant: Shadow DOM trace highlighting (#10227) and allowing GPU
in headless Chrome (#10376) demonstrate why provider behavior must be tested at the
adapter boundary. Migrate the package, preserve provider-specific config, and move
support issues to the community project. Playwright remains the first-party provider
path considered by the main Vitest repository.

## 3.10 Browser Mode migration checklist

- Do not manually open `/__vitest_test__/`; consume the generated session URL.
- Update custom browser commands to accept `SerializedLocator` and use `.selector`.
- Audit text/query assertions for accidental partial matches; use the explicit matching
  matcher where partial/regex behavior is intentional.
- Run visual tests with a dedicated baseline directory under
  `browser.expect.toMatchScreenshot`.
- Enable traces for failure triage and add sparse semantic `mark` boundaries.
- Test watch mode with aliases, query imports, mocks, and dynamic imports.
- Validate the selected provider against Shadow DOM and headless/GPU needs; migrate
  WebdriverIO to its community package.
- Keep UI/browser capabilities narrow (`allowWrite`, `allowExec`, filesystem paths)
  and never expose token/session URLs as public static endpoints.

---

# 4. Mocking: transform, registry, and lifecycle

Vitest mocking is a Vite transform and module-graph operation, not a runtime
replacement for already evaluated ESM imports. The `vitest:mocks` plugin runs after
other transforms, first cheaply tests for a hoistable-call pattern, then parses and
rewrites modules containing `vi.mock`, `vi.unmock`, or `vi.hoisted`. It moves those
calls before imports so registration precedes module evaluation. `vi.doMock` and
`vi.doUnmock` are deliberately excluded from this hoisting rule because they are
runtime APIs.

## 4.1 Top-level hoisting is now enforced (#10460)

v4 warned about a hoistable call nested in a callback; v5 throws and lists every
location. The previous source appeared to run conditionally but the transform ran it
at file evaluation, producing a misleading execution order.

```ts
// invalid in v5: transform would run this before describe itself
describe('service', () => vi.mock('./transport'))

// valid: hoisting and source location agree
vi.mock('./transport')
describe('service', () => {})
```

Move the registration top-level, use a factory/`vi.hoisted` for computed setup, or
use `vi.doMock` when the test truly needs runtime timing. #10410 avoids the parse and
MagicString work entirely when AST collection finds no mock call: this preserves the
correct transform semantics while removing hot-path overhead.

## 4.2 Browser registry and module identity

Browser Mode serializes a mock registration over the Node/orchestrator/tester boundary.
#10192 corrects a subtle semantic loss: an `automock` was deserialized as `autospy`,
so its real exports still executed. `MockerRegistry.register(serialized)` now creates
an `AutomockedModule` for `type: 'automock'`; `{ spy: true }` is the explicit request
for autospy behavior.

```ts
vi.mock('./clock')                 // v5: generated stubs; no real execution
vi.mock('./clock', { spy: true })  // explicit tracked real export behavior
```

The registry indexes both resolved URL and module ID. That is why #9957/#10267 removes
an orphaned Playwright route when equivalent mocked modules arrive through multiple
IDs, and why #10469/#10658 repair optimizer/query imports: mock identity, Vite URL
identity, and external-module resolution must agree. #10489 adds `vite-plus/test` to
the recognised hoist import vocabulary.

## 4.3 Helper stacks, clearing, and conditional behavior

#10415 preserves the `vi.defineHelper` callsite across async error stacks; a mock
helper should report the test's source location rather than an implementation frame.
#10613 changes `clearMocks` default to `true`: before each test Vitest runs
`vi.clearAllMocks()`, clearing calls/instances/contexts/results but retaining mock
implementations. Calls made in module scope or `beforeAll` therefore are not available
to a test assertion unless `clearMocks: false` is set deliberately.

#10174 adds `vi.when()`, a declarative conditional-stubbing API. Treat it as mock
behavior configuration, not module mocking: module registration still obeys hoisting
and module-graph constraints.

**References:** [#10460](https://github.com/vitest-dev/vitest/pull/10460),
[#10410](https://github.com/vitest-dev/vitest/pull/10410),
[#10192](https://github.com/vitest-dev/vitest/pull/10192),
[#10469](https://github.com/vitest-dev/vitest/pull/10469),
[#10613](https://github.com/vitest-dev/vitest/pull/10613),
[#10174](https://github.com/vitest-dev/vitest/pull/10174).

# 5. Reporters, artifacts, snapshots, and UI

Reporters consume the normalized reported-task graph described in Chapter 1. Blob
files are therefore merge inputs, not an opaque console capture; HTML, JSON, JUnit,
summary, and UI are views/serializations of the same run state.

## 5.1 Reporter changes

`configDefaults.reporters` now exposes built-in defaults (#10219). `logger.formatError`
(#10268) centralizes error rendering. JUnit gains Jest-JUnit-compatible naming options
(#10189) and includes unhandled errors (#10244). Summary validates non-finite
`slowTestThreshold` (#10202) and intercepts custom logger streams, not only
`process.stdout`/`stderr` (#10340). JSON/JUnit default to `.vitest` files (#10621),
and HTML defaults to `.vitest` with directory semantics (#10620); #10235 provides the
explicit single-file form.

For merge correctness see #10031 plus #10318 (missing subpath serialization), #10346
(label-safe file names), #10348 (`testModules` across roots), #10338 (HTML source
metadata across roots), and #10570/#10578 (transform timing). Test report consumers
against different project roots, not just sharded copies of one root.

## 5.2 Snapshots and presentation

#9609 replaces `loupe.inspect` with `pretty-format`, affecting assertion diffs and
values interpolated in parameterized titles; #10170 removes quotes from `$` title
variables and the title truncation limit is configurable. #10188 preserves an empty
string snapshot. #10090 prevents `test.fails` from treating snapshot assertion use as
a passing expected failure. Browser trace DOM snapshots (#10102) are trace artifacts,
not Jest snapshot files; they preserve inspected DOM state for UI diagnosis.

Snapshot migration requires reviewing changed serialization, not bulk accepting every
update. Run with the old and new versions, diff snapshot files, and classify formatting
only changes versus changed values/DOM semantics.

## 5.3 UI correctness

#10258 removes duplicate colourized errors; #10418 renders ANSI in the editor inline
widget; #10386 corrects the Browser Mode module graph; #10583 authenticates the UI
API. Together, they make the UI a faithful, access-controlled projection of run state.

# 6. Coverage and process boundaries

V8 coverage is runtime collection through inspector/CDP semantics; Istanbul is
instrumentation. #9976 adds V8-only `coverage.autoAttachSubprocess`, which tracks
`node:child_process` and `node:worker_threads` using `NODE_V8_COVERAGE`. It is opt-in
because Node writes many intermediate coverage files: subprocess visibility costs I/O
and startup/runtime overhead. Tests cover child/thread, nesting, TypeScript,
JavaScript, and pre-transpiled paths.

Coverage glob semantics tighten in #9818 and #10311: matching is relative to the
project root rather than loose absolute-path containment, avoiding sibling root
matches. #10299 prevents `coverage.exclude` from inheriting negation globs from
`test.include`. #10190 permits object `thresholds.perFile`; glob threshold objects
must explicitly declare their own `perFile` behavior. #10495 passes the previous
threshold to `autoUpdate`. #10643 fixes offsets after non-awaited module imports, and
#10466 fails fast if concurrent runs share `reportsDirectory`.

```ts
coverage: {
  provider: 'v8',
  autoAttachSubprocess: true,
  reportsDirectory: 'artifacts/coverage/unit',
  thresholds: { 'src/**': { lines: 90, perFile: true } },
}
```

Use isolated report directories per concurrent job, then merge/report deliberately;
review changed include/exclude output after upgrade rather than preserving accidental
absolute-path matches.

# 7. Expect API, timers, and benchmark API

Chapter 1 covers benchmark architecture. Its public migration is: module-scope `bench`
becomes a test-context fixture; `.run()` executes a registration; `bench.compare()`
interleaves candidates; `writeResult` and `bench.from()` replace implicit compare
storage; standard reporters/JSON carry results; `Vitest.mode` is always `'test'`.
Use retries and `delta` performance matcher thresholds for noisy environments.

Expectation changes are semantic: #9643 restores ordinary substring behavior so
`toThrow('')` matches any error message (use `/^$/` for an empty message); #10233 makes
`expect.poll` fail when callback or assertion exceeds deadline and supplies an
`AbortSignal`; #10264/#10374 accept readonly arrays/sets in `toBeOneOf`; #10473 splits
strict and matching browser text assertions. #10043 adds `fakeTimers.toNotFake`; #10654
updates fake-timers and fakes `Temporal` when present, unless it is explicitly put in
`toNotFake`.

```ts
vi.useFakeTimers({ now: 0, toNotFake: ['Temporal'] })
await expect.poll(async ({ signal }) => fetch('/health', { signal }), { timeout: 1_000 })
  .toSatisfy(r => r.ok)
```

# 8. Reliability, diagnostics, and performance catalog

## 8.1 Post-beta.6 migration delta

The release candidates add compatibility and collection contracts that are material
to a final v5 migration. Beta.7 separates config resolution from server creation,
adds opt-in `injectCjsGlobals`, promotes `fsModuleCache` to a top-level option, and
permits non-ASCII `test.for`/`test.each` title placeholders. It also adds a pluggable
benchmark-provider API.

rc.1 makes inline projects extend the root config by default, supports nested
projects, changes `-t` hierarchy separators to `>`, shares the Vite server between
inline projects, and fails an asynchronous assertion that is not awaited. rc.2
restores the global lifecycle concurrency limit. rc.3 promotes `parseSpecifications`
and `clearCache` out of experimental and moves Istanbul coverage to
`@vitest/istanbuljs` packages. rc.4 makes `vitest list` parse files statically by
default and propagates `--maxWorkers` to projects.

Treat these as upgrade checks: test inline/nested project inheritance, await every
async assertion, update scripts that filter nested test names, and verify custom
coverage or cache integrations against the final package surface.

The remaining release items are small in diff size but protect critical boundaries:

- #9870 TypeScript build mode; #10449 unifies typechecking and AST collection;
  #10461 de-duplicates its warning; #10467 corrects task columns; #10651 permits
  `changed` in config types; #10681 stops printing a column in names.
- #10363 applies CJS interop for truthy `__esModule`; #10223 updates optimizer config;
  #10355/#10658 protect transformed/encoded module resolution.
- #10265 removes an AbortSignal listener leak; #10543 prevents a run hang on worker
  crash; #10587 improves unexpected-exit error text; #10608 awaits `setImmediate` in
  async-leak detection; #10293 handles worker-start failure gracefully.
- #10308 preserves mixed stdout/stderr timestamps; #10421/#10420 applies directory
  force-rerun triggers to files; #10327 escapes a publish-workflow ref name.
- #10276 stringifies diff objects once; #10278 reduces screenshot matching work;
  #10446 reduces allocations in hot paths. None changes user-visible correctness;
  benchmark before claiming speedups in your workload.

# 9. Large-repository migration runbook

1. Upgrade Node/Vite first; lock one Vitest version across workspace projects.
2. Search deleted APIs/packages and `sequential`; migrate compiler-checked imports.
3. Make config paths explicit; run every package script from its real CWD.
4. Move CI artifact collection to `.vitest`, unique coverage directories, and files
   rather than stdout parsing.
5. Run a Browser Mode matrix: locator exactness/text matcher changes, serialized
   custom commands, Shadow DOM, screenshots, watch/mocks, and provider choice.
6. Audit module-scope mock calls, automock assumptions, query/optimizer imports, and
   mock history assertions affected by `clearMocks`.
7. Rebaseline snapshots only after reviewing pretty-format/title changes.
8. Validate coverage file sets and subprocess need; keep auto-attach off unless it
   captures code your product actually owns.
9. Run merge-report and UI checks on multi-root/multi-environment CI artifacts.
10. Roll out with a reproducible lockfile and retain v4 artifacts/reports for one
    comparison cycle; rollback the package version, not individual internal patches.

# 10. Appendices

## 10.1 Glossary

- **orchestrator:** session-bound Browser Mode page that creates/manages tester iframes.
- **tester iframe:** real-browser execution context importing Vite-transformed tests.
- **provider:** automation adapter executing privileged browser commands.
- **SerializedLocator:** `{ selector, locator }` cross-boundary locator wire format.
- **reported task:** normalized test/suite/module data consumed by reporters/UI/merger.
- **blob report:** serialized run data for later merge, not a display-only report.
- **automock/autospy:** generated stub module versus real exports wrapped as spies.
- **artifact root:** root-level `.vitest` directory for generated Vitest output.

## 10.2 Reference map

The beta.1-rc.4 release-note-to-PR/commit index is maintained in
[the local v5 release ledger](./vitest-v5.0.0.md). Primary source at the studied
release is [vitest-dev/vitest v5.0.0-rc.4](https://github.com/vitest-dev/vitest/tree/v5.0.0-rc.4);
the main historical Browser Mode rationale is
[Discussion #5828](https://github.com/vitest-dev/vitest/discussions/5828), and the
benchmark API discussion linked by its PR is
[Discussion #7850](https://github.com/vitest-dev/vitest/discussions/7850).

---

**Completed chapters:** 10 of 10.
