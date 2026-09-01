# Vitest 5: Field Guide / Playbook

**Empirical knowledge, not release notes.** This document collects the real
behavior of Vitest 5 (and its providers) discovered while testing with Web
Components, Shadow DOM and Chromium. It is the operational complement to
[`VITEST_5_TECHNICAL_HANDBOOK.en.md`](./VITEST_5_TECHNICAL_HANDBOOK.en.md): there you
will find "what changed in v5"; here you will find "what it actually does and
how not to lose a day rediscovering it".

**Evidence policy:** every entry states the *symptom*, the *root cause*, the
*fix*, the *test that proves it* and the *version* where it was verified.
Empirical knowledge expires: before trusting these entries after any version
bump, re-run the evidence tests.

**Verification versioning:** `5.0.0-rc.4`

---

## How to use this document

1. When a "weird" test fails (or throws an *Unhandled Rejection* with no red
   test), look up the symptom in the [quick reference table](#quick-reference).
2. Read the full entry: the fix is usually one line, but the knowledge is in
   the *why*.
3. Open the linked evidence test: it is the living proof, not a screenshot.
4. If the case is not here, add it following the template in
   [adding a new entry](#how-to-add-an-entry).

---

## Important distinction: node identity vs coordinates

Several of the incidents below involve two different CDP problems that should
not be confused.

### Resolving an exact node

When the test already knows which DOM element it wants:

```text
Element
  ↓
backendNodeId
```

The goal is to obtain the identity of that exact node in CDP.

### Finding what is under a point

When CDP receives coordinates:

```text
x, y
  ↓
DOM.getNodeForLocation()
  ↓
hit-tested node
```

`DOM.getNodeForLocation()` answers **which element wins the browser hit-test at
those coordinates**. It does not necessarily return the DOM element originally
selected by the test.

An overlay, touch target, internal Material element or another element above the
target can win the hit-test.

For protocol-level pointer interaction, the robust pattern verified by the
evidence tests is:

```text
known Element
  ↓
exact backendNodeId
  ↓
DOM.getContentQuads()
  ↓
CDP geometry
  ↓
click point
  ↓
Input.dispatchMouseEvent
```

This distinction is especially important when the target lives inside the
Vitest test iframe and one or more Shadow Roots.

---

## Incidents

### F1. `clearMocks` now defaults to `true` (breaks late assertions)

**Symptom.** The runner reports an `Unhandled Rejection` with
`AssertionError: expected "vi.fn()" to be called 1 times, but got 0 times`, but
**all tests appear green**. The failure comes from an assertion inside a
`.catch()` / `.then()` that nobody awaited.

**Root cause.** Vitest 5 changed the `clearMocks` default from `false` to `true`
(`vitest/dist/chunks/defaults.js`: `clearMocks: true`). When a test finishes,
Vitest runs `mockClear()` on every mock. If an assertion lives in an **unawaited
async callback** after the test has already ended, the spy can already be clean
when the assertion runs → 0 calls.

The failure is therefore a race: if the callback runs before cleanup, it passes;
if it runs after cleanup, it fails.

The strongest evidence was the spy's "smoking gun": in the same callback, the
counter went from `spy=1` at callback entry to `spy=0` after an `await`. The
event did fire, but the mock was cleaned while the unawaited callback was still
running.

**Fix.** Await the full promise chain inside the test:

```ts
// ❌ assertion in an unawaited callback → possible Unhandled Rejection
el.generateRequest().catch(async () => {
  expect(spyEvent).toHaveBeenCalledTimes(1);
});
server.respond();

// ✅ the test awaits the real async work
const pending = el.generateRequest().catch(() => {
  expect(spyEvent).toHaveBeenCalledTimes(1);
});
server.respond();
await pending;
```

Do not "fix" it by removing an `await aTimeout(...)`: that only changes the
timing of the race; it does not make the test own the async work.

**Evidence.** `packages/base/ajax-provider/test/ajax-provider.test.ts`
(`ajaxerror` / `ajaxerrorend` blocks) in the
`blockquote-web-components` monorepo. Confirmed with a config override
(`clearMocks: false`) that removes the observed symptom.

**Verified in.** `5.0.0-rc.1`.

---

### F2. `cdp()` attaches to the orchestrator page; inspect the test iframe via its `frameId`

**Symptom.** You call `Accessibility.getFullAXTree` or `queryAXTree` via `cdp()`
and you do not see your DOM: only the `RootWebArea` of the "Vitest Browser
Runner" page and an AX `Iframe` node without its test content.
`DOMSnapshot.captureSnapshot` does not expose an *aria snapshot* either.

**Root cause.** In the tested Vitest Browser Mode setup, the CDP session returned
by `cdp()` is attached to the runner/orchestrator page, which embeds the iframe
where the test executes.

The frames are same-origin, but each frame has its own document and accessibility
tree. A document-level call without an explicit `frameId` therefore targets the
root frame associated with the CDP session.

The test iframe is visible as an iframe from the root page, but its accessibility
content belongs to the iframe's own AX tree.

**Fix.** Resolve the test frame's `frameId` and pass it to
`Accessibility.getFullAXTree`:

```ts
const {frameTree} = await client.send('Page.getFrameTree');

// The test runs in the Vitest iframe in this verified setup.
const frameId = frameTree.childFrames[0].frame.id;

const {nodes} = await client.send(
  'Accessibility.getFullAXTree',
  {
    frameId,
  }
);
```

This returns the full AX tree of the test iframe, including its `RootWebArea`
and the components rendered by the test.

`DOM.getNodeForLocation()` can also report the `frameId` of the node that wins
hit-testing at a given point, which is useful when investigating coordinate
problems.

Do not treat `DOM.getNodeForLocation()` as a general way to resolve a known DOM
element to its exact CDP node. It performs hit-testing and can return an overlay,
touch target or another element above the node selected by the test.

For a **specific node**, `Accessibility.getPartialAXTree` and
`Accessibility.queryAXTree` need a node anchor. Resolve the actual element to
its CDP `backendNodeId`, then use that identifier as the anchor:

```ts
const {nodes} = await client.send(
  'Accessibility.getPartialAXTree',
  {
    backendNodeId,
    fetchRelatives: true,
  }
);
```

This returns the local live AX information around that node, including the
observed role, computed name, properties and current value.

**Evidence.** `test/counter-element-aria-cdp.test.ts:198` (helper
`getFullAXTree`), `test/counter-element-aria-cdp.test.ts:919`
(`getFullAXTree({frameId})` test), `test/counter-element-aria-cdp.test.ts:270`
(helper `getCDPNodeForElement`), `test/counter-element-aria-cdp.test.ts:811`
(progressbar audit).

**Verified in.** `5.0.0-rc.1`, Chromium.

---

### F3. AX schema: a `progressbar`'s current value is exposed through top-level `value`

**Symptom.** You query the AX node of a `progressbar` with
`Accessibility.getPartialAXTree` and look for `valuenow` in the `properties`
array, getting `undefined`.

**Root cause.** In the observed Chromium AX protocol response, the current
numeric value was exposed through the top-level `value` field:

```ts
{
  type: 'number',
  value: 3,
}
```

Related properties such as `valuemin`, `valuemax` and `focusable` appeared in
the `properties` array.

**Fix.** Read the current value from `node.value?.value`; use `properties` for
the related AX properties:

```ts
const axValue = (node) =>
  node.value?.value;

const axProperty = (node, name) =>
  node.properties
    ?.find((property) => property.name === name)
    ?.value
    ?.value;
```

**Evidence.** `test/counter-element-aria-cdp.test.ts:241` (helper `axValue`),
`:811` (audit with initial value 3 and value 4 after interaction).

**Verified in.** `5.0.0-rc.1`, Chromium.

---

### F4. The `disabled` filter of `getByRole` did not match `aria-disabled` on a `progressbar`

**Symptom.** `getByRole('progressbar', {disabled: true})` does not find a
`progressbar` with `aria-disabled="true"`, even though the attribute is present
in the DOM.

**Root cause.** In the tested configuration, the `disabled` option did not match
the `aria-disabled="true"` state on this `progressbar`.

The observed role-filter behavior therefore did not provide a reliable way to
assert the ARIA attribute in this case.

**Fix.** Assert the attribute directly:

```ts
await expect
  .element(
    page.getByRole(
      'progressbar',
      {
        name: 'Session progress',
      }
    )
  )
  .toHaveAttribute(
    'aria-disabled',
    'true'
  );
```

**Evidence.** `test/counter-element-aria-cdp.test.ts:521` (`filters by disabled
state`). Note: the `src/FocusStepper.ts` component disables
`lit-a11y/role-supports-aria-attr` because it deliberately uses `aria-disabled`
on a `progressbar`.

**Verified in.** `5.0.0-rc.1`.

---

### F5. `DOM.getNodeForLocation` performs hit-testing; it may not return the element you selected

**Symptom.** You want to resolve the real `<button>` that is two Shadow Roots
deep, for example:

```text
counter-element
  ↓
md-filled-button
  ↓
button
```

Using `DOM.getNodeForLocation()` at the visual center of the button can return
the Material touch target `<span>` instead of the real `<button>`.

Also, querying from a host node with `DOM.querySelector()` does not descend into
its Shadow Root in the tested CDP path.

**Root cause.** `DOM.getNodeForLocation()` answers:

> What element wins hit-testing at these coordinates?

It does **not** answer:

> Which DOM element did my test originally select?

An overlay or touch target can therefore be returned instead of the intended
button.

Separately, in the tested Chromium/CDP path, querying from the host did not
descend into its shadow tree. Querying with the Shadow Root as the root node did.

**Fix.** When the goal is to inspect an internal Shadow DOM node through the CDP
DOM domain, walk the flattened document and query from the Shadow Root:

```ts
const {nodes} = await client.send(
  'DOM.getFlattenedDocument',
  {
    depth: -1,
    pierce: true,
  }
);

const materialHost =
  nodes.find(
    (node) =>
      node.localName === 'md-filled-button'
  );

const shadowRoot =
  materialHost.shadowRoots[0];

const {nodeId} = await client.send(
  'DOM.querySelector',
  {
    nodeId: shadowRoot.nodeId,
    selector: 'button',
  }
);

const {node} = await client.send(
  'DOM.describeNode',
  {
    nodeId,
  }
);

expect(node.localName)
  .toBe('button');
```

**Evidence.** `test/counter-element-aria-cdp.test.ts:941` (`pierces nested
shadow roots in the DOM domain snapshot`).

**Verified in.** `5.0.0-rc.1`, Chromium.

---

### F6. `toHaveFocus` may not reflect focus on an internal Shadow DOM element

**Symptom.** `expect.element(page.getByRole('button')).toHaveFocus()` can fail
when the actual focused node is inside a Shadow Root.

**Root cause.** At the document boundary, `document.activeElement` can be the
custom element host while the actual focused element is exposed through:

```ts
shadowRoot.activeElement
```

The focus state therefore depends on the tree boundary being inspected.

**Fix.** Query the relevant Shadow Root directly:

```ts
await userEvent.tab();

expect(
  el.shadowRoot?.activeElement?.id
).toBe('toggle');
```

**Evidence.** `test/counter-element-aria-cdp.test.ts:689` (Space/Enter
activation and focus management),
`test/counter-element-aria-cdp.test.ts:723` (arrows on the progressbar).

**Verified in.** `5.0.0-rc.1`.

---

### F7. `Input.dispatchKeyEvent` from the root CDP session did not reach the focused test iframe

**Symptom.** You use `Input.dispatchKeyEvent` via the root CDP session to
simulate the keyboard and nothing happens: the expected active element inside
the test iframe does not receive the key.

**Root cause.** In the verified setup, the CDP session is attached to the
Vitest runner/orchestrator page. Protocol-level keyboard input injected through
that session did not target the focused element inside the test iframe.

**Fix.** For normal keyboard interaction in Browser Mode, use:

```ts
await userEvent.keyboard(' ');
await userEvent.tab();
```

This exercises the test through Vitest's browser interaction layer and, in the
verified setup, targets the correct test document.

Do not generalize this observation to every possible CDP target/session setup:
the evidence only establishes the behavior of the root CDP session used here.

**Evidence.** `test/counter-element-aria-cdp.test.ts:689`, `:723`
(keyboard via `userEvent`).

**Verified in.** `5.0.0-rc.1`, Chromium.

---

### F8. `Input.dispatchMouseEvent` can click inside the test iframe when coordinates come from CDP geometry

**Symptom.** A normal protocol-level mouse sequence appears to do nothing even
though the target button exists and can be found through Vitest's locators.

The target may be inside the Vitest test iframe and one or more Shadow Roots.

**Root cause.** The problem is not necessarily `Input.dispatchMouseEvent`
itself; it can be the coordinate system used for `x` and `y`.

Coordinates obtained from:

```ts
element.getBoundingClientRect()
```

belong to the element's document. Manually combining those coordinates with
iframe offsets can mix coordinate spaces and produce a point that looks valid
but misses the actual target.

`DOM.getNodeForLocation()` is not a replacement for resolving the exact element
either: it performs hit-testing and can return an overlay or touch target above
the selected node.

**Fix.** Resolve the exact element to its CDP `backendNodeId`, wait for the next
animation frame (a `requestAnimationFrame` — avoids empty quads when
`browser.trace: 'on'` is active), ask CDP for that node's geometry with
`DOM.getContentQuads()`, translate the coordinates from the iframe viewport to
the root-page viewport, and dispatch the mouse events at that point:

```ts
async function getCDPClickPointForElement(
  element: Element
): Promise<{x: number; y: number}> {
  await client.send('DOM.enable');

  const {backendNodeId, frameId} =
    await getCDPNodeForElement(element);

  // trace: 'on' can temporarily invalidate layout after marker removal.
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => resolve())
  );

  const {quads} = await client.send(
    'DOM.getContentQuads',
    {backendNodeId}
  );

  if (!quads?.length) {
    throw new Error(
      `DOM.getContentQuads returned no geometry for backendNodeId ${backendNodeId}`
    );
  }

  const quad = quads[0] as number[];

  if (quad.length !== 8) {
    throw new Error(
      `Unexpected quad returned by DOM.getContentQuads: ${JSON.stringify(quad)}`
    );
  }

  // [x1, y1, x2, y2, x3, y3, x4, y4]
  let x = (quad[0] + quad[2] + quad[4] + quad[6]) / 4;
  let y = (quad[1] + quad[3] + quad[5] + quad[7]) / 4;

  // Translate from iframe to root-page coordinates
  const {frameTree} = await client.send('Page.getFrameTree');

  if (frameTree.frame.id !== frameId) {
    const {node} = await client.send(
      'DOM.getFrameOwner',
      {frameId}
    );

    if (node?.backendNodeId) {
      const {model} = await client.send(
        'DOM.getBoxModel',
        {backendNodeId: node.backendNodeId}
      );

      x += model.content[0];
      y += model.content[1];
    }
  }

  return {x: Math.round(x), y: Math.round(y)};
}
```

Then dispatch the complete pointer sequence:

```ts
const {x, y} =
  await getCDPClickPointForElement(button);

await client.send(
  'Input.dispatchMouseEvent',
  {
    type: 'mouseMoved',
    x,
    y,
  }
);

await client.send(
  'Input.dispatchMouseEvent',
  {
    type: 'mousePressed',
    x,
    y,
    button: 'left',
    buttons: 1,
    clickCount: 1,
  }
);

await client.send(
  'Input.dispatchMouseEvent',
  {
    type: 'mouseReleased',
    x,
    y,
    button: 'left',
    buttons: 0,
    clickCount: 1,
  }
);
```

The evidence test confirmed the complete browser event sequence:

```text
pointerdown
mousedown
pointerup
mouseup
click
```

and confirmed that the event reached the custom element and changed the
component state:

```text
counter: 5
  ↓
counter: 6
```

The verified interaction path is therefore:

```text
Vitest locator
  ↓
real DOM element
  ↓
exact backendNodeId
  ↓
DOM.getContentQuads()
  ↓
center point in CDP geometry
  ↓
Input.dispatchMouseEvent
  ↓
pointerdown
mousedown
pointerup
mouseup
click
  ↓
component state update
```

**Evidence.** `test/counter-element-aria-cdp.test.ts:26` (helper
`getCDPClickPointForElement`),
`test/counter-element-aria-cdp.test.ts:981` (`drives a real pointer click with
raw Input.dispatchMouseEvent`).

**Verified in.** `5.0.0-rc.1`, Chromium.

---

### F9. `Emulation.setEmulatedMedia` affected `matchMedia` in real time

**Symptom/pattern.** You want to test `@media (prefers-reduced-motion)` or
`forced-colors` without reconfiguring the browser.

**Fix/pattern.** In the tested Chromium session,
`Emulation.setEmulatedMedia` changed the media state observed by `matchMedia()`
inside the test iframe:

```ts
await client.send(
  'Emulation.setEmulatedMedia',
  {
    media: '',
    features: [
      {
        name: 'prefers-reduced-motion',
        value: 'reduce',
      },
      {
        name: 'forced-colors',
        value: 'active',
      },
    ],
  }
);

expect(
  matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches
).toBe(true);

// Restore the default state.
await client.send(
  'Emulation.setEmulatedMedia',
  {
    media: '',
    features: [],
  }
);
```

**Evidence.** `test/counter-element-aria-cdp.test.ts:1058` (`emulates
prefers-reduced-motion and forced-colors at the protocol level`).

**Verified in.** `5.0.0-rc.1`, Chromium.

---

### F10. Exact `getByText` did not resolve slotted text in the tested component structure

**Symptom.** `getByText('light-dom')` does not find text mounted as Light DOM
content for a component slot, even though the text is visible.

**Root cause.** In the tested component structure, exact `getByText()` did not
resolve the slotted text, while the generated programmatic ARIA tree did include
the composed text.

The evidence establishes the observed behavior for this structure; it should not
be treated as a general rule for every possible slot or text-query combination.

**Fix.** When the goal is to verify composed accessible content, inspect the
programmatic ARIA tree:

```ts
const tree =
  utils.aria.renderAriaTree(
    utils.aria.generateAriaTree(el)
  );

expect(tree)
  .toContain('- text: light-dom');
```

**Evidence.** `test/counter-element-aria-cdp.test.ts:421` (`prunes aria-hidden
nodes but keeps composed slotted light DOM`).

**Verified in.** `5.0.0-rc.1`.

---

### F11. Positive pattern: ARIA locators pierce nested Shadow DOM

**Symptom/pattern.** Not an incident — it is the shortcut that avoids manually
walking Shadow Roots for most browser-level assertions.

In the tested setup, `getByRole` and related ARIA locators can find elements
inside nested Shadow DOM without additional configuration:

```ts
const button =
  page.getByRole(
    'button',
    {
      name: 'Counter: 5',
    }
  );

await expect
  .element(button)
  .toBeEnabled();

await expect
  .element(button)
  .toHaveAccessibleName(
    'Counter: 5'
  );
```

This does not imply that the CDP `DOM` domain follows the same traversal rules.
ARIA locators and CDP DOM queries are separate mechanisms.

`page.elementLocator(el)` together with `toMatchAriaInlineSnapshot` can also
compare the component's accessible tree against a literal snapshot, including
the tested composed content:

```yaml
- button "Hide session panel" [expanded]
- heading "Session progress" [level=2]
- progressbar "Session progress"
- button "Complete session"
- status
```

**Evidence.** `test/counter-element-aria-cdp.test.ts:393` (locators block),
`test/counter-element-aria-cdp.test.ts:1134` (`toMatchAriaInlineSnapshot`),
`test/counter-element-aria-cdp.test.ts:1152` (programmatic tree).

**Verified in.** `5.0.0-rc.1`.

---

### F12. Trace recording can make the first CDP geometry lookup return no quads

**Symptom.** With `browser.trace: 'on'`, `DOM.getContentQuads()` can return an
empty `quads` array for a freshly resolved element. The same complete file
passes with `--browser.trace=off`, while the trace-enabled failure reports a
valid `backendNodeId` but no geometry.

**Observed cause boundary.** In `5.0.0-rc.4`, the failure appeared after earlier
tests had generated trace activity. It was not tied to one preceding CDP
command, and keeping the original `RemoteObject` alive was insufficient by
itself. The evidence establishes a transient trace/geometry interaction; it
does not establish which Vitest, Playwright or Chromium trace stage causes it.

**Fix.** Keep the CDP `RemoteObject` alive while requesting its geometry. If
the result has no quads, wait for the next animation frame and resolve the DOM
element to a new CDP object before retrying. Bound the operation and fail if no
attempt produces layout geometry:

```ts
for (let attempt = 0; attempt < 3; attempt += 1) {
  const geometry = await resolveAndReadQuads(element);

  if (geometry.quads.length) {
    return geometry;
  }

  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => resolve())
  );
}

throw new Error(
  'DOM.getContentQuads returned no geometry after 3 element resolutions'
);
```

Do not retry the same detached identifier indefinitely. Each attempt should
re-establish the element-to-CDP correlation, consume it before releasing the
remote object, and have a fixed upper bound.

**Evidence.** `test/counter-element-aria-cdp.test.ts` (helpers
`withCDPNodeForElement` and `getCDPClickPointForElement`; test `drives a real
pointer click with raw Input.dispatchMouseEvent`). Before the fix, trace-enabled
stress produced 4 geometry failures in 25 repetitions and the complete file
failed; with trace disabled, all 26 tests passed. After the fix, the complete
trace-enabled project passed all 37 tests.

**Verified in.** `5.0.0-rc.4`, Chromium/Playwright 1.62.

---

## Quick reference

| Symptom | Entry |
| --- | --- |
| Green tests but `Unhandled Rejection` with a spy at 0 calls | [F1](#f1-clearmocks-now-defaults-to-true-breaks-late-assertions) |
| `getFullAXTree` does not see your DOM / only sees the runner iframe | [F2](#f2-cdp-attaches-to-the-orchestrator-page-inspect-the-test-iframe-via-its-frameid) |
| A `progressbar`'s current value returns `undefined` via CDP | [F3](#f3-ax-schema-a-progressbars-current-value-is-exposed-through-top-level-value) |
| `getByRole(..., {disabled: true})` does not find `aria-disabled` | [F4](#f4-the-disabled-filter-of-getbyrole-did-not-match-aria-disabled-on-a-progressbar) |
| `DOM.getNodeForLocation` returns an overlay/touch target instead of the selected element | [F5](#f5-domgetnodeforlocation-performs-hit-testing-it-may-not-return-the-element-you-selected) |
| `toHaveFocus` does not reflect focus inside a Shadow Root | [F6](#f6-tohavefocus-may-not-reflect-focus-on-an-internal-shadow-dom-element) |
| `Input.dispatchKeyEvent` from the root CDP session does nothing in the test iframe | [F7](#f7-inputdispatchkeyevent-from-the-root-cdp-session-did-not-reach-the-focused-test-iframe) |
| Raw CDP click misses an element inside the test iframe / Shadow DOM | [F8](#f8-inputdispatchmouseevent-can-click-inside-the-test-iframe-when-coordinates-come-from-cdp-geometry) |
| Test `prefers-reduced-motion` / `forced-colors` | [F9](#f9-emulationsetemulatedmedia-affected-matchmedia-in-real-time) |
| Exact `getByText` does not find slotted text | [F10](#f10-exact-getbytext-did-not-resolve-slotted-text-in-the-tested-component-structure) |
| Find/in-snapshot elements inside nested Shadow DOM | [F11](#f11-positive-pattern-aria-locators-pierce-nested-shadow-dom) |
| `DOM.getContentQuads` intermittently returns no geometry with traces enabled | [F12](#f12-trace-recording-can-make-the-first-cdp-geometry-lookup-return-no-quads) |

---

## Debugging method

The meta-knowledge that made F1-F11 solvable. Attack order for a "weird"
failure in Vitest 5 Browser Mode:

1. **Isolate.** Run a single file with a single browser:

   ```bash
   npx vitest run test/my-suite.test.ts
   ```

   This reduces cross-test contamination.

2. **Bisect.** Use:

   ```bash
   npx vitest run -t "test name"
   ```

   If the failure survives in isolation, the problem is more likely to be local
   to the test or component. If it only appears in the full suite, investigate
   shared state, lifecycle cleanup, global mocks or a shared fake server.

3. **Instrument in place.** Put `console.log` inside the suspect callback and
   record the actual order of events and state transitions.

   Example from F1: print `spy.mock.calls.length` at callback entry and again
   after an `await`.

4. **Confirm with a config override.** To test a hypothesis about a default,
   temporarily invert it:

   ```ts
   clearMocks: false
   ```

   If the symptom changes exactly as predicted, the hypothesis gains strong
   evidence.

5. **Reduce to a minimal repro.** Once the mechanism is understood, reproduce
   it with the smallest possible test. If the minimal repro passes, compare its
   execution context with the failing suite.

6. **Separate node identity from geometry.** When debugging CDP interaction,
   first ask:

   ```text
   Do I have the exact node?
   ```

   and then separately:

   ```text
   Do I have coordinates in the coordinate system expected by this CDP command?
   ```

   Do not use a hit-test result as proof that you resolved the original element.

Golden rule: **an `Unhandled Rejection` means some asynchronous failure escaped
the test's normal control flow until proven otherwise.** First verify whether the
promise chain is properly awaited before blaming the component.

---

## How to add an entry

Follow the F1-F12 entry template:

1. Observable **Symptom** — including where it appears: runner, matcher, CDP,
   browser or component.
2. **Root cause** — explain the observed mechanism, not just the solution.
3. **Fix / pattern** — with the smallest useful code example.
4. **Evidence** — path of the real test plus line number or stable `describe` /
   test name.
5. **Verified in** — Vitest version plus provider/browser.

When writing the root cause, distinguish clearly between:

```text
Observed:
what the evidence test directly proves

Inferred:
the mechanism that best explains the observation

General:
behavior known to apply outside this exact tested configuration
```

Do not silently promote an empirical observation into a general protocol rule.

Conditions for inclusion:

- it was **unexpected** behavior;
- it cost more than 15 minutes to understand;
- there is a real evidence test proving the behavior;
- the entry records the exact version/provider/browser where it was observed.

If the behavior is already clearly documented as an intended API contract, it
does not belong here as an incident; link to it from the technical handbook
instead.
