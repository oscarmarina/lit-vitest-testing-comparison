# Vitest 5: Field Guide / Playbook

**Empirical knowledge, not release notes.** This document collects the real
behavior of Vitest 5 (and its providers) discovered while testing with Web
Components, Shadow DOM and Chromium. It is the operational complement to
[`VITEST_5_TECHNICAL_HANDBOOK.md`](./VITEST_5_TECHNICAL_HANDBOOK.md): there you
will find "what changed in v5"; here you will find "what it actually does and
how not to lose a day rediscovering it".

**Evidence policy:** every entry states the *symptom*, the *root cause*, the
*fix*, the *test that proves it* and the *version* where it was verified.
Empirical knowledge expires: before trusting these entries after any version
bump, re-run the evidence tests.

**Verification versioning:** `5.0.0-rc.1`, Chromium/Playwright 1.62.

---

## How to use this document

1. When a "weird" test fails (or throws an *Unhandled Rejection* with no red
   test), look up the symptom in the [quick reference table](#quick-reference).
2. Read the full entry: the fix is usually one line, but the knowledge is in the
   *why*.
3. Open the linked evidence test: it is the living proof, not a screenshot.
4. If the case is not here, add it following the template in
   [adding a new entry](#how-to-add-an-entry).

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
async callback** (the test already ended), the spy is already clean when the
assertion runs → 0 calls. Moreover, the failure is a **race**: if the callback
runs before the cleanup (microtask), it passes; if it runs after, it fails. That
is why it looks intermittent.

The irrefutable evidence is the spy's "smoking gun": in the same callback, the
counter goes from `spy=1` (right at entry) to `spy=0` (after an `await`): the
event DID fire, but the mock was cleaned mid-flight.

**Fix.** Await the full promise chain inside the test:

```ts
// ❌ assertion in unawaited callback → Unhandled Rejection
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

Do not "fix" it by removing the `await aTimeout(...)`: that only changes the
race, it does not eliminate it. If the provider switched to emitting events on a
timer instead of synchronously, the test would fail again.

**Evidence.** `packages/base/ajax-provider/test/ajax-provider.test.ts`
(`ajaxerror` / `ajaxerrorend` blocks) in the
`blockquote-web-components` monorepo. Confirmed with a config override
(`clearMocks: false`) that makes the error disappear.

**Verified in.** `5.0.0-rc.1`.

---

### F2. `cdp()` attaches to the orchestrator page; reach the test iframe via its `frameId`

**Symptom.** You call `Accessibility.getFullAXTree` or `queryAXTree` via `cdp()`
and you do not see your DOM: only the `RootWebArea` of the "Vitest Browser
Runner" page and an AX `Iframe` node **without children** (`childIds: []`).
`DOMSnapshot.captureSnapshot` does not expose an *aria snapshot* either.

**Root cause.** The CDP session of `cdp()` (from `vitest/browser`) attaches to
the **orchestrator** page, which embeds the iframe where your test runs. The
frames are **same-origin**, but each frame keeps its own AX tree. A
document-level call **without `frameId` defaults to the root frame**, so the
test iframe only shows up as an empty `Iframe` node.

**Fix.** Resolve the test frame's `frameId` and pass it to `getFullAXTree`:

```ts
const {frameTree} = await client.send('Page.getFrameTree');
// the test runs in <iframe name="vitest-iframe">
const frameId = frameTree.childFrames[0].frame.id;

const {nodes} = await client.send('Accessibility.getFullAXTree', {frameId});
```

This returns the **full AX tree of the test iframe** (`RootWebArea` "Vitest
Browser Tester" + your components). `DOM.getNodeForLocation` also reports the
`frameId` of the node it resolves, which is handy when you only have
coordinates.

For a **specific node**, `getPartialAXTree`/`queryAXTree` need a node anchor;
`getCDPNodeForElement` (the "node under the cursor" trick) provides it via
`DOM.getNodeForLocation`, and `getPartialAXTree` returns the local AX subtree:

```ts
const {backendNodeId} = await client.send('DOM.getNodeForLocation', {
  x: Math.round(rect.x + rect.width / 2),
  y: Math.round(rect.y + rect.height / 2),
});
const {nodes} = await client.send('Accessibility.getPartialAXTree', {
  backendNodeId,
  fetchRelatives: true,
});
```

This returns the element's **live AX node** (role, computed name, properties and
current value) — the browser's real AX cache, independent of your DOM reads.

**Evidence.** `test/counter-element-aria-cdp.test.ts:86` (helper
`getFullAXTree`), `test/counter-element-aria-cdp.test.ts:452`
(`getFullAXTree({frameId})` test), `test/counter-element-aria-cdp.test.ts:105`
(helper `getCDPNodeForElement`), `test/counter-element-aria-cdp.test.ts:372`
(progressbar audit).

**Verified in.** `5.0.0-rc.1`, Chromium.

---

### F3. AX schema: a `progressbar`'s value is not in `properties`

**Symptom.** You query the AX node of a `progressbar` with
`Accessibility.getPartialAXTree` and look for `valuenow` in the `properties`
array, getting `undefined`.

**Root cause.** For value widgets, the **current value lives in the top-level
`value` field** of the AX node (`{type: 'number', value: 3}`). Only `valuemin`,
`valuemax`, `valuetext` and `focusable` live in `properties` (the last only
appears if the element has a `tabindex`).

**Fix.** Read `node.value?.value` for the current value; keep `properties` for
the extremes and attributes:

```ts
const axValue = (node) => node.value?.value;   // valuenow
const axProperty = (node, name) =>
  node.properties?.find((p) => p.name === name)?.value?.value; // valuemin/max/focusable
```

**Evidence.** `test/counter-element-aria-cdp.test.ts:138` (helper `axValue`),
`:372` (audit with initial value 3 and value 4 after interaction).

**Verified in.** `5.0.0-rc.1`, Chromium.

---

### F4. The `disabled` filter of `getByRole` ignores `aria-disabled`

**Symptom.** `getByRole('progressbar', {disabled: true})` does not find a
`progressbar` with `aria-disabled="true"`, even though the attribute is in the
DOM.

**Root cause.** The `disabled` filter of the Ivya role engine matches the
**native** `disabled` attribute (buttons), but **not** `aria-disabled` on
non-button widgets. They are different accessible states: the role filter
operates on the real widget state, not on the ARIA markup attribute.

**Fix.** For widgets, use the attribute directly:

```ts
// ❌ getByRole('progressbar', {name: 'Session progress', disabled: true})
await expect
  .element(page.getByRole('progressbar', {name: 'Session progress'}))
  .toHaveAttribute('aria-disabled', 'true');
```

**Evidence.** `test/counter-element-aria-cdp.test.ts:213` (`filters by disabled
state`). Note: the `src/FocusStepper.ts` component disables
`lit-a11y/role-supports-aria-attr` because it deliberately uses `aria-disabled`
on a `progressbar`.

**Verified in.** `5.0.0-rc.1`.

---

### F5. `DOM.querySelector` only pierces Shadow DOM when rooted at the Shadow Root

**Symptom.** You want to resolve the real `<button>` that is two Shadow Roots
deep (e.g. `counter-element` → `md-filled-button` → `<button>`). Two paths fail:
`DOM.getNodeForLocation` at the button's center returns the Material *touch
target* `<span>`, and `DOM.querySelector({nodeId: host})` with a `button`
selector does not descend through the host's Shadow Root.

**Root cause.** `getNodeForLocation` resolves the highest-z-index element under
the cursor (Material buttons overlay a *touch target*). And CDP's
`DOM.querySelector` only crosses Shadow DOM when the root `nodeId` **is** the
Shadow Root itself, not when it is the host.

**Fix.** Walk the flattened tree and query from the Shadow Root:

```ts
const {nodes} = await client.send('DOM.getFlattenedDocument', {depth: -1, pierce: true});
const materialHost = nodes.find((n) => n.localName === 'md-filled-button');
const shadowRoot = materialHost.shadowRoots[0];

const {nodeId} = await client.send('DOM.querySelector', {
  nodeId: shadowRoot.nodeId,   // ← the root must be the Shadow Root
  selector: 'button',
});
const {node} = await client.send('DOM.describeNode', {nodeId});
expect(node.localName).toBe('button');
```

**Evidence.** `test/counter-element-aria-cdp.test.ts:469` (`pierces nested
shadow roots in the DOM domain snapshot`).

**Verified in.** `5.0.0-rc.1`, Chromium.

---

### F6. `toHaveFocus` is unreliable for internal Shadow DOM elements

**Symptom.** `expect.element(page.getByRole('button')).toHaveFocus()` fails (or
passes misleadingly) for a button inside the Shadow Root, even though the real
focus is on it.

**Root cause.** `document.activeElement` (and the matcher that uses it) points to
the custom element's **host**, not to the inner Shadow Root element. Focus
retention across the shadow boundary is not reflected in
`document.activeElement`.

**Fix.** Query the Shadow Root's `activeElement` directly:

```ts
await userEvent.tab();
expect(el.shadowRoot?.activeElement?.id).toBe('toggle');
```

**Evidence.** `test/counter-element-aria-cdp.test.ts:294` (Space/Enter activation
and focus management),
`test/counter-element-aria-cdp.test.ts:315` (arrows on the progressbar).

**Verified in.** `5.0.0-rc.1`.

---

### F7. `Input.dispatchKeyEvent` does not reach the test iframe

**Symptom.** You use `Input.dispatchKeyEvent` via CDP to simulate the keyboard
and nothing happens: your page's `activeElement` never receives the key.

**Root cause.** The CDP session points to the orchestrator page (F2).
Protocol-level keyboard events are directed at that parent page's focus, not the
test iframe.

**Fix.** For the keyboard use `userEvent.keyboard(...)` / `userEvent.tab()` from
`vitest/browser`, which injects events inside the correct iframe. Reserve CDP
`Input.*` for **pointer**, which does work (F8).

**Evidence.** `test/counter-element-aria-cdp.test.ts:294`, `:315`
(keyboard via `userEvent`).

**Verified in.** `5.0.0-rc.1`.

---

### F8. `Input.dispatchMouseEvent` produces real clicks that do arrive

**Symptom/pattern.** Unlike the keyboard, the protocol-level pointer sequence
**works** on the iframe content and triggers the real handlers.

**Fix/pattern.**

```ts
await client.send('Input.dispatchMouseEvent', {type: 'mouseMoved', x, y});
await client.send('Input.dispatchMouseEvent', {type: 'mousePressed', x, y, button: 'left', clickCount: 1});
await client.send('Input.dispatchMouseEvent', {type: 'mouseReleased', x, y, button: 'left', clickCount: 1});
```

Useful when you need the "system" click (e.g. to verify the browser's AX tree
reflects the new state, independent of the matcher).

**Evidence.** `test/counter-element-aria-cdp.test.ts:498` (`drives a real
pointer click with raw Input.dispatchMouseEvent`).

**Verified in.** `5.0.0-rc.1`, Chromium.

---

### F9. `Emulation.setEmulatedMedia` affects `matchMedia` in real time

**Symptom/pattern.** You want to test `@media (prefers-reduced-motion)` or
`forced-colors` without reconfiguring the browser.

**Fix/pattern.** `Emulation.setEmulatedMedia` changes `matchMedia(...).matches`
live inside the iframe:

```ts
await client.send('Emulation.setEmulatedMedia', {
  media: '',
  features: [
    {name: 'prefers-reduced-motion', value: 'reduce'},
    {name: 'forced-colors', value: 'active'},
  ],
});
expect(matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(true);
// ... finally restore
await client.send('Emulation.setEmulatedMedia', {media: '', features: []});
```

**Evidence.** `test/counter-element-aria-cdp.test.ts:530` (`emulates
prefers-reduced-motion and forced-colors at the protocol level`).

**Verified in.** `5.0.0-rc.1`, Chromium.

---

### F10. Exact `getByText` fails with slotted text

**Symptom.** `getByText('light-dom')` does not find text you mounted as a Light
DOM `slot` inside the component, even though the text is visible.

**Root cause.** Slotted text is composed into the accessible tree, but exact
text matching does not reach it the way a role-based lookup does. The
programmatic tree serialization does include it.

**Fix.** To verify composed content, use the programmatic ARIA tree:

```ts
const tree = utils.aria.renderAriaTree(utils.aria.generateAriaTree(el));
expect(tree).toContain('- text: light-dom');
```

**Evidence.** `test/counter-element-aria-cdp.test.ts:165` (`prunes aria-hidden
nodes but keeps composed slotted light DOM`).

**Verified in.** `5.0.0-rc.1`.

---

### F11. Positive pattern: ARIA locators pierce nested Shadow DOM

**Symptom/pattern.** Not an incident — it is the shortcut that avoids all of the
above: `getByRole` / `getByLabelText` see through Shadow Roots **with no extra
configuration**:

```ts
const button = page.getByRole('button', {name: 'Counter: 5'}); // 2 shadow roots deep
await expect.element(button).toBeEnabled();
await expect.element(button).toHaveAccessibleName('Counter: 5');
```

And `page.elementLocator(el)` + `toMatchAriaInlineSnapshot` compares the
component's **full ARIA tree** against a literal snapshot, including slotted
text:

```yaml
- button "Hide session panel" [expanded]
- heading "Session progress" [level=2]
- progressbar "Session progress"
- button "Complete session"
- status
```

**Evidence.** `test/counter-element-aria-cdp.test.ts:146` (locators block),
`test/counter-element-aria-cdp.test.ts:579` (`toMatchAriaInlineSnapshot`),
`test/counter-element-aria-cdp.test.ts:588` (programmatic tree).

**Verified in.** `5.0.0-rc.1`.

---

## Quick reference

| Symptom | Entry |
| --- | --- |
| Green tests but `Unhandled Rejection` with a spy at 0 calls | [F1](#f1-clearmocks-now-defaults-to-true-breaks-late-assertions) |
| `getFullAXTree` does not see your DOM / opaque iframe | [F2](#f2-cdp-attaches-to-the-orchestrator-page-not-the-test-iframe) |
| A `progressbar`'s `valuenow` returns `undefined` via CDP | [F3](#f3-ax-schema-a-progressbars-value-is-not-in-properties) |
| `getByRole(..., {disabled:true})` does not find `aria-disabled` | [F4](#f4-the-disabled-filter-of-getbyrole-ignores-aria-disabled) |
| You cannot resolve the real button under a Material Web Component | [F5](#f5-domqueryselector-only-pierces-shadow-dom-when-rooted-at-the-shadow-root) |
| `toHaveFocus` fails/misleads inside the Shadow DOM | [F6](#f6-tohavefocus-is-unreliable-for-internal-shadow-dom-elements) |
| `Input.dispatchKeyEvent` does nothing | [F7](#f7-inputdispatchkeyevent-does-not-reach-the-test-iframe) |
| You need a "system" click that reaches the iframe | [F8](#f8-inputdispatchmouseevent-produces-real-clicks-that-do-arrive) |
| Test `prefers-reduced-motion` / `forced-colors` | [F9](#f9-emulationsetemulatedmedia-affects-matchmedia-in-real-time) |
| Exact `getByText` does not find slotted text | [F10](#f10-exact-getbytext-fails-with-slotted-text) |
| Find/in-snapshot elements inside the Shadow DOM | [F11](#f11-positive-pattern-aria-locators-pierce-nested-shadow-dom) |

---

## Debugging method

The meta-knowledge that made F1-F11 solvable. Attack order for a "weird" failure
in Vitest 5 Browser Mode:

1. **Isolate.** `npx vitest run test/my-suite.test.ts` — a single file, a single
   browser. Removes cross-test contamination.
2. **Bisect.** `-t "test name"` filters without touching code. If it fails in
   isolation, the problem is the test/component; if it only fails in the suite,
   it is shared-state contamination (very common with a shared `beforeAll` or a
   global fake server).
3. **Instrument in place.** `console.log` inside the suspect callback to see the
   **real order** of events and the state at each point. Example that exposed F1:
   printing `spy.mock.calls.length` right at callback entry and after the
   `await`.
4. **Confirm with a config override.** To test a hypothesis about a default,
   create a config that inverts it (`clearMocks: false`, etc.) and observe
   whether the symptom disappears. That turns a hunch into a confirmed cause.
5. **Reduce to a minimal repro.** Once confirmed, replicate the pattern in a
   single-case test. If the minimal repro passes, the difference is in the
   context; go back to step 2.

Golden rule: **an `Unhandled Rejection` is a bug in your test, not in the
component.** "The event never fired" is almost always "the event fired but
nobody is watching anymore".

---

## How to add an entry

Follow the F1-F11 entry template:

1. Observable **Symptom** (and where it shows: runner, matcher, CDP).
2. **Root cause** (mechanism, not the solution).
3. **Fix / pattern** with minimal code.
4. **Evidence** = path of the real test + line number/`describe`.
5. **Verified in** = Vitest version + provider.

Conditions for inclusion: it was **unexpected** behavior (not in Vitest's docs),
it cost you > 15 min to figure out, and there is a test proving it. If it is
official documentation, it does not belong here; link it to the handbook.
