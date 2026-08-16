# ARIA + CDP Testing in `counter-element-aria-cdp.test.ts`

This document explains in detail what `test/counter-element-aria-cdp.test.ts`
tests, why it is designed that way, and which technical discoveries (some
unexpected) surfaced while building it.

It is meant for:

- Understanding the **state of the art** of accessibility testing for **Lit**
  and **Shadow DOM** Web Components with Vitest 5 Browser Mode.
- Acting as **living documentation** of the limitations and quirks of the CDP
  (Chrome DevTools Protocol) and of ARIA locators.

---

## 1. Context

### 1.1 What is Vitest Browser Mode?

Vitest 5 can run tests directly in a real browser (Chromium via Playwright by
default). Unlike *jsdom*, here custom elements, Shadow DOM and the browser's
accessibility engine actually work. This allows:

- Using **ARIA locators** (`getByRole`, `getByLabelText`, …) that query the
  browser's **real accessibility tree**.
- Simulating **user interactions** (`userEvent`) that dispatch real pointer and
  keyboard events.
- Talking directly to the browser through the **CDP protocol** with the `cdp()`
  helper from `vitest/browser`.

### 1.2 What is CDP?

CDP (Chrome DevTools Protocol) is the protocol DevTools uses to talk to
Chromium. With `cdp()` from tests you can invoke raw protocol methods, e.g.
`Accessibility.getPartialAXTree`, `DOM.describeNode` or
`Emulation.setEmulatedMedia`. It is a "backdoor" to inspect the accessibility
tree **exactly** as the browser sees it.

### 1.3 Components under test

**`counter-element`** (defined in `src/CounterElement.ts`): a Lit Web
Component that renders an `<h1>`, a material button (`md-filled-button`, itself
another Web Component with its own Shadow DOM) whose text is "Counter: N", an
`<hr aria-hidden="true">` and a `slot` for Light DOM. Click the button and the
counter increments. It is the case study for **two levels of nested Shadow
DOM**: `counter-element` → `md-filled-button` → `<button>`.

**`FocusStepper`** (defined in `src/FocusStepper.ts` and registered via
`src/define/focus-stepper.js`): a self-contained Lit component that exercises
the "ARIA state matrix" we want to query:

- A *disclosure* button with `aria-expanded` that shows/hides a panel and
  moves focus.
- A `role="progressbar"` with `aria-valuemin/max/now/text`, `aria-disabled` and
  `tabindex`, adjustable with the keyboard arrows.
- A second "Complete session" button that increments progress and emits a
  `session-complete` event (bubbling and *composed*).
- A `role="status"` region with `aria-live="polite"`.

---

## 2. File structure

The file has **24 tests** organized in **5 `describe` blocks**:

| Block | Topic |
| ----- | ----- |
| 1. `ARIA locators pierce nested Shadow DOM` | Locating elements across Shadow DOM. |
| 2. `Interactive accessibility state changes` | Tracking accessible state changes. |
| 3. `Real user interactions (userEvent)` | Real pointer and keyboard interactions. |
| 4. `CDP deep dive (Chromium only)` | Deep dive into the CDP protocol. |
| 5. `Accessibility tree snapshots & matching` | ARIA tree snapshots and matching. |

There is also a section of reusable **helpers**:

- `mountCounter` / `mountStepper`: mount each component via `fixture` from
  `@open-wc/testing-helpers`, which awaits the element's `updateComplete`.
  `afterEach(fixtureCleanup)` removes the mounted fixtures after each test.
- `axNodeAtPoint`: the key CDP piece (explained in section 6).
- `axFind`, `axProperty`, `axValue`: utilities to navigate the AX tree nodes
  returned by CDP.

---

## 3. Block 1: ARIA locators pierce the Shadow DOM

The tests in this block mount `counter-element` and verify that Vitest's
locating engine can **see inside Shadow Roots**, something impossible with plain
`document.querySelector`.

### `finds the internal <h1> by role, level and accessible name`

```
page.getByRole('heading', {level: 1, name: 'Hello, Hey there!'})
```

The `<h1>` lives inside `counter-element`'s Shadow DOM. The locator finds it by
combining **role + level + accessible name**, and then role, name and text are
verified with the `toHaveRole`, `toHaveAccessibleName` and `toHaveTextContent`
matchers. It demonstrates that role-based lookup relies on the real
accessibility tree, not the HTML.

### `reaches the button two shadow roots deep`

```
page.getByRole('button', {name: 'Counter: 5'})
```

The real button is **two Shadow DOM levels** deep: `counter-element` →
`md-filled-button` → `<button>`. The locator reaches it anyway. We also check it
is enabled (`toBeEnabled`) and that its **accessible name is computed
correctly** from the visible text ("Counter: 5").

### `prunes aria-hidden nodes but keeps composed slotted light DOM`

Two checks on how the accessible tree is composed:

1. **`aria-hidden` is pruned**: the `<hr aria-hidden="true">` is invisible to
   the accessibility tree, so `getByRole('separator').query()` returns `null`.
2. **Slotted Light DOM is composed**: the "light-dom" text we mount as children
   of `<counter-element>` ends up in the tree. We verify it programmatically
   with
   `utils.aria.renderAriaTree(utils.aria.generateAriaTree(el))`, which returns
   the serialized ARIA tree and must contain `- text: light-dom`.

---

## 4. Block 2: Accessible state changes over time

Here `FocusStepper` is mounted and we verify that **the accessibility tree
reacts to reactive-property state changes**.

### `tracks aria-expanded transitions with the expanded filter`

Before clicking, the button is `Show session panel` with `expanded: false`.
After clicking:

- The button is renamed **"Hide session panel"** (the text depends on
  `this.expanded`) and the `expanded: true` filter finds it.
- The collapsed version no longer exists (`query()` → `null`).
- The panel's `progressbar`, previously hidden, is now visible.

This test also reveals an **important quirk**: the button's **name changes with
the state**. It is a legitimate *disclosure* pattern, but worth keeping in mind
when writing tests (a locator for one state does not work for the other).

### `collapses the panel and hides the inner controls again`

It walks the reverse path: click the button again (now "Hide session panel"),
the panel is hidden (`display: none`) and the `progressbar` disappears from the
accessible tree (`query()` → `null`). The button returns to `expanded: false`
and to the name "Show session panel". It covers the **collapse** branch of the
component's `#onToggle` (focus management only runs when expanding).

### `filters by disabled state`

The component is disabled (`el.disabled = true`) and we verify:

- `getByRole('button', {name: 'Complete session', disabled: true})` and
  `getByRole('button', {name: 'Hide session panel', disabled: true})` find the
  **natively disabled** buttons (they have the `disabled` attribute).
- The `disabled: false` variant no longer finds the button (`query()` → `null`).
- The `progressbar` keeps `aria-disabled="true"` as an attribute.

**Important finding**: the `disabled` filter of `getByRole` **does match the
native `disabled` attribute**, but on non-button widgets the filter **ignores
`aria-disabled`**. That is why here we verify the `progressbar` with
`toHaveAttribute('aria-disabled', 'true')` instead of the role filter. (This is
why the `src/FocusStepper.ts` component disables
`lit-a11y/role-supports-aria-attr`: we deliberately use `aria-disabled` on a
`progressbar`.)

### `lets includeHidden find collapsed-but-rendered controls`

When the panel is collapsed, the `progressbar` has `display: none`, so it is
**pruned from the accessible tree**: `getByRole('progressbar')` does not find
it. The `includeHidden: true` option **rescues** it and lets us read its
`aria-valuenow`. Useful for verifying the state of hidden-but-rendered controls.

### `propagates value changes into aria-valuenow and the live region`

Full increment flow:

1. `value = 3` → the `progressbar` has `aria-valuenow="3"` and
   `aria-valuetext="3 of 10 sessions completed"`.
2. The `role="status"` region reflects the same text (a *live* region).
3. Pressing "Complete session" moves everything to `4`: `aria-valuenow="4"` and
   the live region announces "4 of 10 sessions completed".

It verifies that **state propagates from the reactive property to the ARIA
attributes and the live region**.

### `locates the progressbar through its label`

Uses `getByLabelText('Session progress')` to find the `progressbar` by its
`aria-label` and reads its `aria-valuenow`. Complements `getByRole`.

### `reflects counter changes in the accessible name of the material button`

Switches to the material `counter-element` and verifies that the button's
**accessible name** changes with state ("Counter: 5" → "Counter: 6") after a
click. The accessible name is not a static attribute: it is the **text computed
by the accessibility engine**.

---

## 5. Block 3: Real user interactions (`userEvent`)

This block uses `userEvent` from `vitest/browser`, which simulates **real
events** (not artificial dispatches), to validate behavior as a person would.

### `increments with a real pointer click and double click`

- A single click moves the counter from 5 to 6.
- A **double click** moves it from 6 to 8 (two increments). `dblClick` fires two
  real clicks; the component handles each one.

### `activates a focused button with Space and Enter`

A **focus and keyboard management** test:

1. `userEvent.tab()` places focus on the `toggle` button (first in tab order).
   We verify `el.shadowRoot?.activeElement?.id === 'toggle'`.
2. `userEvent.keyboard('{Enter}')` activates the button by keyboard → the panel
   expands.
3. **Focus management**: when expanding, the component moves focus to `complete`
   (the Shadow Root's `activeElement` is checked).
4. `userEvent.keyboard(' ')` (space bar) activates the "Complete session" button
   → `aria-valuenow="4"`.

Note: `toHaveFocus` does not work well with internal Shadow DOM elements
(`document.activeElement` is the *host*, not the inner button), so we check
`shadowRoot.activeElement` directly. Another project finding.

### `supports arrow-key adjustment on the focused progressbar`

1. After expanding, focus is on "Complete session".
2. `userEvent.keyboard('{Shift>}{Tab}{/Shift}')` (Shift+Tab) moves focus to the
   `progressbar`.
3. `userEvent.keyboard('{ArrowRight}')` increments the value to 4 via the
   component's `keydown` handler (`#onMeterKeydown`).
4. `{ArrowLeft}` decrements it back to 3 (always within the `0..max` range).
5. An unrelated key (`a`) is ignored: the value does not change. The handler
   only reacts to `ArrowRight`/`ArrowLeft`.

### `applies and releases real pointer hover state`

`userEvent.hover` / `userEvent.unhover` apply a **real pointer hover**, verified
with `element().matches(':hover')` (first `false`, then `true`, then `false`
again). It is the basis for testing CSS `:hover` effects or tooltips.

---

## 6. Block 4: CDP deep dive (`cdp()`)

This is the most interesting block. We talk **directly to Chromium** at the
protocol level to audit the accessibility tree "first hand".

### The underlying problem (key finding)

We discovered that **the `cdp()` session attaches to the "orchestrator" page**,
not to the iframe where the test runs. That is why:

- `Accessibility.getFullAXTree` returns **only the orchestrator page's tree**,
  where the test iframe appears as a single `Iframe` node **without children**
  (`childIds: []`).
- `Accessibility.queryAXTree` returns empty for other frames' subtrees.
- `DOMSnapshot.captureSnapshot` does not expose any *aria snapshot* field.

In other words: **we cannot ask CDP for the iframe's AX tree directly.**

### The solution: `axNodeAtPoint` (CDP's "eye")

```ts
async function axNodeAtPoint(selector) {
  const rect = selector().getBoundingClientRect();
  const x = Math.round(rect.x + rect.width / 2);
  const y = Math.round(rect.y + rect.height / 2);
  const {backendNodeId} = await client.send('DOM.getNodeForLocation', {x, y});
  const {nodes} = await client.send('Accessibility.getPartialAXTree', {
    backendNodeId,
    fetchRelatives: true,
  });
  return {backendNodeId, ax: nodes};
}
```

Trick: we ask Chromium which element is **under the cursor** at the coordinates
of the center of the element we care about (`DOM.getNodeForLocation` →
`backendNodeId`) and then request the **live AX node** of that element with
`Accessibility.getPartialAXTree`. This returns the role, the computed accessible
name, the properties (`focusable`, `valuemin`, …) and, for widgets, the
**current value**. It is the real accessibility tree, independent of the DOM we
read from the test.

### The block's tests

**`audits the live progressbar AX node and its valuenow over time`**

- Locates the `progressbar` via `axNodeAtPoint`, finds its AX node with
  `axFind(ax, 'progressbar')` and verifies name, value, `valuemax` and
  `focusable`.
- **AX schema finding**: a `progressbar`'s current value is NOT in
  `properties.valuenow` (it does not even exist): it lives in the node's
  top-level **`value`** field. `valuemin`, `valuemax` and `focusable` do live in
  `properties`. That is why the `axValue()` helper reads `node.value?.value`.
- After pressing "Complete session" we **re-query the AX node** and confirm the
  browser updated its AX cache to `4`, independently of our DOM read. It proves
  **the browser's AX cache is the authoritative source**.
- `backendNodeId` is greater than 0: the protocol resolved a real DOM node.

**`audits the live accessible name of the material button`**

- Repeats the pattern on `counter-element`: gets the AX node of the material
  button (two Shadow DOMs deep) and verifies its **computed accessible name** is
  "Counter: 5".
- After a real click, the new AX node returns "Counter: 6". The accessible name
  Chromium computes **matches Vitest's locator**.

**`audits the document-level AX tree with Accessibility.getFullAXTree`**

- Verifies the orchestrator page has a `RootWebArea` node and that the test
  iframe appears as an `Iframe` AX node. It documents section 6.1's limitation:
  **the iframe's full tree is not reachable via CDP**; you must go node by node
  with `getPartialAXTree`.

**`pierces nested shadow roots in the DOM domain snapshot`**

- With `DOM.getFlattenedDocument({depth: -1, pierce: true})` we get the flattened
  DOM tree **piercing the Shadow Roots**: the `counter-element` node exposes
  `shadowRoots`, and inside it is the `md-filled-button` host, which exposes its
  own `shadowRoots`.
- **Finding**: `DOM.getNodeForLocation` on the button does not return the
  `<button>` but a Material *touch target* `<span>`. The robust way to resolve
  the real button is `DOM.querySelector` **rooted at the Shadow Root's
  `nodeId`**:

  ```ts
  const {nodeId} = await client.send('DOM.querySelector', {
    nodeId: materialShadowRoot.nodeId,
    selector: 'button',
  });
  ```

- `DOM.describeNode({nodeId})` confirms the resolved node is a `<button>`.
  In other words: CDP's `querySelector` only pierces Shadow DOM when the root is
  the Shadow Root itself.

**`drives a real pointer click with raw Input.dispatchMouseEvent`**

- We dispatch `mouseMoved`, `mousePressed` and `mouseReleased` with
  `Input.dispatchMouseEvent` (the exact sequence a real click generates at the
  system level).
- The counter moves to 6 and the AX tree reflects it. **At the protocol level,
  without touching the DOM**, we can click.

**`emulates prefers-reduced-motion and forced-colors at the protocol level`**

- With `Emulation.setEmulatedMedia` we enable `prefers-reduced-motion: reduce`
  and `forced-colors: active`.
- We verify with `matchMedia(...)` that the value changes to `true`, and after
  restoring the state (`features: []`) it returns to `false`.
- This lets us test `@media (prefers-reduced-motion)` styles and high-contrast
  themes without touching browser configuration.

**`dispatches a composed event whose detail matches the CDP-observed value`**

- We spy on `dispatchEvent` with `vi.spyOn` and check that the component emits
  `session-complete` with `detail: 4` (the value after completing). It unifies
  the real interaction (`userEvent`) with the event-contract verification.

---

## 7. Block 5: ARIA tree snapshots and matching

### `exposes the composed ARIA tree as an inline snapshot`

Uses `page.elementLocator(el)` + `toMatchAriaInlineSnapshot` to compare the
component's full ARIA tree against a literal snapshot:

```yaml
- button "Hide session panel" [expanded]
- heading "Session progress" [level=2]
- progressbar "Session progress"
- button "Complete session"
- status
```

Any change in roles, names or accessible states **breaks the snapshot**: an
excellent safety net for component refactors.

### `renders the ARIA tree programmatically and tracks updates`

Generates the tree with `utils.aria.generateAriaTree(el)` and serializes it with
`utils.aria.renderAriaTree(...)`. Verifies it contains the `progressbar`, the
`status` and the text "3 of 10 sessions completed", and that after completing a
session it reflects "4 of 10 sessions completed". A programmatic (matcher-free)
version of the snapshot.

### `keeps matcher-computed and CDP-computed accessible names in sync`

Closes the loop: the accessible name **Vitest's matcher** computes ("Counter: 5")
must match the one **CDP computes directly**
(`axFind(ax, 'button')?.name?.value`), before and after the click. If the two
sources diverged, we would have a reliability problem in the locator layer.

---

## 8. Summary of technical findings

| Finding | Where it is documented |
| -------- | ------------------ |
| `cdp()` attaches to the orchestrator page; the test iframe is a separate AX tree. | Section 6.1, `getFullAXTree` test |
| `Accessibility.getFullAXTree` / `queryAXTree` cannot reach the iframe content. | Section 6.1 |
| `DOM.getNodeForLocation` + `Accessibility.getPartialAXTree` give the "live" AX node of any element. | `axNodeAtPoint` helper |
| A `progressbar`'s value is in `node.value`, not in `properties.valuenow`. | `valuenow over time` test |
| The `disabled` filter of `getByRole` ignores `aria-disabled` on non-button widgets. | `filters by disabled state` test |
| `DOM.querySelector` pierces Shadow DOM only when rooted at the Shadow Root's `nodeId`. | `DOM domain snapshot` test |
| `DOM.getNodeForLocation` can resolve Material's *touch target* instead of the `<button>`. | `DOM domain snapshot` test |
| `toHaveFocus` is unreliable for internal Shadow DOM elements; use `shadowRoot.activeElement`. | Space/Enter test |
| `Emulation.setEmulatedMedia` affects `matchMedia` in real time. | `prefers-reduced-motion` test |
| `Input.dispatchMouseEvent` generates real clicks at the protocol level. | `dispatchMouseEvent` test |
| ARIA locators pierce nested Shadow DOM with no extra configuration. | Block 1 |

---

## 9. How to run

```bash
# Only this file
npx vitest run test/counter-element-aria-cdp.test.ts

# Whole project (includes the original counter-element suite)
npx vitest run

# Watch mode during development
npx vitest
```

Requires the project installed with `@vitest/browser` and Playwright (Chromium).
The tests depend on Chromium; some CDP capabilities (e.g. `Input` and
`Emulation`) are Chromium-specific.

---

## 10. Possible extensions or "toys"

Ideas that could grow from this work:

1. **Accessibility regression matrix**: query the AX node after every interaction
   and compare `role + name + focusable + disabled` against a golden JSON per
   state.
2. **Custom matcher** `toHaveLiveAXNode`: wrap `axNodeAtPoint` in an `expect`
   extension so the team can write
   `expect(el).toHaveLiveAXNode({role: 'progressbar', value: 4})`.
3. **`prefers-reduced-motion` harness**: a helper that enables/restores media
   emulation to verify components drop animations and contrast in
   `forced-colors`.
4. **Pointer fuzzer**: use `DOM.getNodeForLocation` on random points to detect
   "dead zones" where an overlaid *touch target* swallows clicks meant for a
   real control.
5. **AX bridge between frames**: a generic helper (`axNodeAtPoint`-style) that
   serves as a CDP abstraction layer for the rest of the team.
