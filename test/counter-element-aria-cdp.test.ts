import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {cdp, page, userEvent, utils} from 'vitest/browser';
import {html} from 'lit';
import {fixture, fixtureCleanup} from '@open-wc/testing-helpers';
import type {CounterElement} from '../src/CounterElement.js';
import type {FocusStepper} from '../src/FocusStepper.js';
import '../src/define/counter-element.js';
import '../src/define/focus-stepper.js';

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

async function mountCounter(): Promise<CounterElement> {
  return fixture<CounterElement>(html`
    <counter-element>light-dom</counter-element>
  `);
}

async function mountStepper(): Promise<FocusStepper> {
  return fixture<FocusStepper>(html`
    <focus-stepper></focus-stepper>
  `);
}

/* CDP ---------------------------------------------------------------------- */

interface CDPClient {
  send(method: string, params?: Record<string, unknown>): Promise<any>;
}

const client = cdp() as CDPClient;

interface AXNode {
  nodeId: string;
  parentId?: string;
  ignored?: boolean;
  role?: {value: string};
  name?: {value: string};
  /** For widgets the live value lives at the top level, not in `properties`. */
  value?: {type: string; value: unknown};
  properties?: {name: string; value: {type: string; value: unknown}}[];
  childIds?: string[];
}

interface FrameNode {
  frame?: {id: string; name?: string};
  childFrames?: FrameNode[];
}

/**
 * The `cdp()` session is attached to the orchestrator page; the test runs in a
 * same-origin `<iframe name="vitest-iframe">`. Document-level AX calls without
 * a `frameId` default to the root frame (the runner + an `Iframe` node with no
 * children), so full-tree queries must target the test frame's `frameId` (F2).
 */
async function getTestFrameId(): Promise<string> {
  await client.send('Page.enable');
  const {frameTree} = await client.send('Page.getFrameTree');
  const findTestFrame = (node: FrameNode): string | undefined => {
    if (node.frame?.name === 'vitest-iframe') {
      return node.frame.id;
    }
    for (const child of node.childFrames ?? []) {
      const id = findTestFrame(child);
      if (id) {
        return id;
      }
    }
    return undefined;
  };
  const frameId = findTestFrame(frameTree);
  if (!frameId) {
    throw new Error('test iframe not found in Page.getFrameTree');
  }
  return frameId;
}

/**
 * The full AX tree of a frame. Without a `frameId` it defaults to the root
 * frame (the runner + an `Iframe` node with no children); pass the test
 * frame's `frameId` to get the iframe's own tree (see F2).
 */
async function getFullAXTree(frameId?: string): Promise<AXNode[]> {
  await client.send('Accessibility.enable');
  const {nodes} = await client.send('Accessibility.getFullAXTree', {
    ...(frameId ? {frameId} : {}),
  });
  return nodes as AXNode[];
}

interface CDPNodeLocation {
  backendNodeId: number;
  nodeId: number;
  frameId: string;
}

/**
 * Correlate a test-DOM element with its CDP node and frame: resolve the node
 * under the cursor at the element's center. The response reports the `frameId`
 * of the frame that owns the node, plus its `backendNodeId`/`nodeId`.
 */
async function getNodeAtLocation(element: Element): Promise<CDPNodeLocation> {
  const rect = element.getBoundingClientRect();
  const x = Math.round(rect.x + rect.width / 2);
  const y = Math.round(rect.y + rect.height / 2);
  const result = await client.send('DOM.getNodeForLocation', {x, y});
  return {
    backendNodeId: result.backendNodeId as number,
    nodeId: result.nodeId as number,
    frameId: result.frameId as string,
  };
}

/**
 * The local AX subtree around a backend node. `getPartialAXTree`/`queryAXTree`
 * need a node anchor; `getNodeAtLocation` supplies it.
 */
async function getPartialAXTree(backendNodeId: number): Promise<AXNode[]> {
  const {nodes} = await client.send('Accessibility.getPartialAXTree', {
    backendNodeId,
    fetchRelatives: true,
  });
  return nodes as AXNode[];
}

function axFind(ax: AXNode[], role: string): AXNode | undefined {
  return ax.find((node) => !node.ignored && node.role?.value === role);
}

function axProperty(node: AXNode, name: string): unknown {
  return node.properties?.find((prop) => prop.name === name)?.value?.value;
}

/** progressbar/scrollbar expose their current value as the top-level `value`. */
function axValue(node: AXNode): unknown {
  return node.value?.value;
}

/* -------------------------------------------------------------------------- */
/*  Tests                                                                     */
/* -------------------------------------------------------------------------- */

describe('ARIA locators pierce nested Shadow DOM', () => {
  beforeEach(mountCounter);
  afterEach(fixtureCleanup);

  it('finds the internal <h1> by role, level and accessible name', async () => {
    const heading = page.getByRole('heading', {level: 1, name: 'Hello, Hey there!'});

    await expect.element(heading).toHaveRole('heading');
    await expect.element(heading).toHaveAccessibleName('Hello, Hey there!');
    await expect.element(heading).toHaveTextContent('Hello, Hey there!');
  });

  it('reaches the button two shadow roots deep (counter-element -> md-filled-button)', async () => {
    const button = page.getByRole('button', {name: 'Counter: 5'});

    await expect.element(button).toBeEnabled();
    await expect.element(button).toHaveAccessibleName('Counter: 5');
  });

  it('prunes aria-hidden nodes but keeps composed slotted light DOM', async () => {
    const el = document.querySelector('counter-element')!;

    // <hr aria-hidden="true"> must stay invisible to the accessibility tree…
    expect(page.getByRole('separator').query()).toBeNull();

    // …while the slotted light DOM is composed into the tree.
    const tree = utils.aria.renderAriaTree(utils.aria.generateAriaTree(el));
    expect(tree).toContain('- text: light-dom');
  });
});

describe('Interactive accessibility state changes', () => {
  let el: FocusStepper;
  beforeEach(async () => {
    el = await mountStepper();
  });
  afterEach(fixtureCleanup);

  it('tracks aria-expanded transitions with the expanded filter', async () => {
    const collapsed = page.getByRole('button', {name: 'Show session panel', expanded: false});
    await expect.element(collapsed).toBeVisible();

    await userEvent.click(collapsed);
    await el.updateComplete;

    expect(
      page.getByRole('button', {name: 'Show session panel', expanded: false}).query()
    ).toBeNull();
    const expanded = page.getByRole('button', {name: 'Hide session panel', expanded: true});
    await expect.element(expanded).toHaveAttribute('aria-expanded', 'true');
    await expect.element(page.getByRole('progressbar', {name: 'Session progress'})).toBeVisible();
  });

  it('collapses the panel and hides the inner controls again', async () => {
    await userEvent.click(page.getByRole('button', {name: 'Show session panel'}));
    await el.updateComplete;
    await expect.element(page.getByRole('progressbar', {name: 'Session progress'})).toBeVisible();

    await userEvent.click(page.getByRole('button', {name: 'Hide session panel'}));
    await el.updateComplete;

    await expect
      .element(page.getByRole('button', {name: 'Show session panel', expanded: false}))
      .toHaveAttribute('aria-expanded', 'false');
    expect(page.getByRole('progressbar', {name: 'Session progress'}).query()).toBeNull();
  });

  it('filters by disabled state', async () => {
    await userEvent.click(page.getByRole('button', {name: 'Show session panel'}));
    await el.updateComplete;

    el.disabled = true;
    await el.updateComplete;

    // The native-disabled buttons are matched by the disabled role filter. Note
    // the disclosure label switched to "Hide" once the panel was expanded.
    await expect
      .element(page.getByRole('button', {name: 'Complete session', disabled: true}))
      .toBeDisabled();
    await expect
      .element(page.getByRole('button', {name: 'Hide session panel', disabled: true}))
      .toBeDisabled();

    // …and the progressbar keeps its aria-disabled state in the attribute.
    await expect
      .element(page.getByRole('progressbar', {name: 'Session progress'}))
      .toHaveAttribute('aria-disabled', 'true');

    expect(
      page.getByRole('button', {name: 'Complete session', disabled: false}).query()
    ).toBeNull();
  });

  it('lets includeHidden find collapsed-but-rendered controls', async () => {
    // Collapsed panel: the progressbar is display:none, so it is pruned…
    expect(page.getByRole('progressbar', {name: 'Session progress'}).query()).toBeNull();

    // …but includeHidden reaches it anyway.
    await expect
      .element(page.getByRole('progressbar', {name: 'Session progress', includeHidden: true}))
      .toHaveAttribute('aria-valuenow', '3');
  });

  it('propagates value changes into aria-valuenow and the live region', async () => {
    await userEvent.click(page.getByRole('button', {name: 'Show session panel'}));
    await el.updateComplete;

    const meter = page.getByRole('progressbar', {name: 'Session progress'});
    await expect.element(meter).toHaveAttribute('aria-valuenow', '3');
    await expect.element(meter).toHaveAttribute('aria-valuetext', '3 of 10 sessions completed');
    await expect.element(page.getByRole('status')).toHaveTextContent('3 of 10 sessions completed');

    await userEvent.click(page.getByRole('button', {name: 'Complete session'}));
    await el.updateComplete;

    await expect.element(meter).toHaveAttribute('aria-valuenow', '4');
    await expect.element(page.getByRole('status')).toHaveTextContent('4 of 10 sessions completed');
  });

  it('locates the progressbar through its label', async () => {
    await userEvent.click(page.getByRole('button', {name: 'Show session panel'}));
    await expect
      .element(page.getByLabelText('Session progress'))
      .toHaveAttribute('aria-valuenow', '3');
  });

  it('reflects counter changes in the accessible name of the material button', async () => {
    fixtureCleanup();
    await mountCounter();
    await userEvent.click(page.getByRole('button', {name: 'Counter: 5'}));
    await expect
      .element(page.getByRole('button', {name: 'Counter: 6'}))
      .toHaveAccessibleName('Counter: 6');
  });
});

describe('Real user interactions (userEvent)', () => {
  afterEach(fixtureCleanup);

  it('increments with a real pointer click and double click', async () => {
    await mountCounter();
    await userEvent.click(page.getByRole('button', {name: 'Counter: 5'}));
    await expect.element(page.getByRole('button', {name: 'Counter: 6'})).toBeVisible();

    await userEvent.dblClick(page.getByRole('button', {name: 'Counter: 6'}));
    await expect.element(page.getByRole('button', {name: 'Counter: 8'})).toBeVisible();
  });

  it('activates a focused button with Space and Enter', async () => {
    const el = await mountStepper();

    await userEvent.tab();
    expect(el.shadowRoot?.activeElement?.id).toBe('toggle');

    await userEvent.keyboard('{Enter}');
    await el.updateComplete;
    await expect.element(page.getByRole('button', {name: 'Hide session panel'})).toBeVisible();

    // Expanding moves focus into the revealed panel (focus management).
    expect(el.shadowRoot?.activeElement?.id).toBe('complete');

    // Space activates the focused "Complete session" button.
    await userEvent.keyboard(' ');
    await el.updateComplete;
    await expect
      .element(page.getByRole('progressbar', {name: 'Session progress'}))
      .toHaveAttribute('aria-valuenow', '4');
  });

  it('supports arrow-key adjustment on the focused progressbar', async () => {
    const el = await mountStepper();
    await userEvent.click(page.getByRole('button', {name: 'Show session panel'}));
    await el.updateComplete;

    // Focus starts on "Complete session"; Shift+Tab reaches the progressbar.
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}');
    expect(el.shadowRoot?.activeElement?.id).toBe('meter');

    const meter = page.getByRole('progressbar', {name: 'Session progress'});

    await userEvent.keyboard('{ArrowRight}');
    await el.updateComplete;
    await expect.element(meter).toHaveAttribute('aria-valuenow', '4');

    // ArrowLeft decrements within the 0..max range.
    await userEvent.keyboard('{ArrowLeft}');
    await el.updateComplete;
    await expect.element(meter).toHaveAttribute('aria-valuenow', '3');

    // Unrelated keys are ignored: the value stays untouched.
    await userEvent.keyboard('a');
    await el.updateComplete;
    await expect.element(meter).toHaveAttribute('aria-valuenow', '3');
  });

  it('increments the complete button by step', async () => {
    const el = await fixture<FocusStepper>(html`
      <focus-stepper step="2" max="5" expanded></focus-stepper>
    `);
    await el.updateComplete;

    await userEvent.click(page.getByRole('button', {name: 'Complete session'}));
    await el.updateComplete;
    expect(el.value).toBe(5);

    // The value stays clamped at max regardless of the step.
    await userEvent.click(page.getByRole('button', {name: 'Complete session'}));
    await el.updateComplete;
    expect(el.value).toBe(5);
  });

  it('applies and releases real pointer hover state', async () => {
    await mountCounter();
    const button = page.getByRole('button', {name: 'Counter: 5'});

    expect(button.element().matches(':hover')).toBe(false);
    await userEvent.hover(button);
    expect(button.element().matches(':hover')).toBe(true);
    await userEvent.unhover(button);
    expect(button.element().matches(':hover')).toBe(false);
  });
});

describe('CDP deep dive (Chromium only)', () => {
  afterEach(fixtureCleanup);

  it('audits the live progressbar AX node and its valuenow over time', async () => {
    const el = await mountStepper();
    await userEvent.click(page.getByRole('button', {name: 'Show session panel'}));
    await el.updateComplete;

    // Resolve the progressbar's CDP node + frame, then audit it through the
    // test frame's full AX tree: the `frameId` reported by
    // `DOM.getNodeForLocation` is the one `getFullAXTree` targets.
    const {frameId} = await getNodeAtLocation(
      page.getByRole('progressbar', {name: 'Session progress'}).element()
    );
    expect(frameId).toBeTruthy();
    const getMeter = async () => axFind(await getFullAXTree(frameId), 'progressbar');

    const meter = await getMeter();
    expect(meter).toBeDefined();
    expect(meter?.name?.value).toBe('Session progress');
    // valuenow is the top-level AX `value`; valuemin/valuemax/focusable live in
    // the `properties` bag (verified against the raw protocol response).
    expect(axValue(meter!)).toBe(3);
    expect(axProperty(meter!, 'valuemax')).toBe(10);
    expect(axProperty(meter!, 'focusable')).toBe(true);

    await userEvent.click(page.getByRole('button', {name: 'Complete session'}));
    await el.updateComplete;

    // The browser's AX cache is authoritative and independent of our DOM reads.
    expect(axValue((await getMeter())!)).toBe(4);
  });

  it('audits the live accessible name of the material button', async () => {
    await mountCounter();

    // Local-subtree technique: anchor on the button's backend node and pull
    // the AX context around it with getPartialAXTree (which needs an anchor).
    const {backendNodeId} = await getNodeAtLocation(
      page.getByRole('button', {name: 'Counter: 5'}).element()
    );
    const buttonAx = axFind(await getPartialAXTree(backendNodeId), 'button');
    expect(buttonAx?.name?.value).toBe('Counter: 5');
    expect(axProperty(buttonAx!, 'focusable')).toBe(true);

    await userEvent.click(page.getByRole('button', {name: 'Counter: 5'}));

    const {backendNodeId: backendNodeIdAfter} = await getNodeAtLocation(
      page.getByRole('button', {name: 'Counter: 6'}).element()
    );
    const axAfter = await getPartialAXTree(backendNodeIdAfter);
    expect(axFind(axAfter, 'button')?.name?.value).toBe('Counter: 6');
  });

  it('reaches the test AX tree via Accessibility.getFullAXTree({frameId})', async () => {
    await mountCounter();

    // Without a frameId the helper defaults to the root frame: the runner's
    // RootWebArea plus an Iframe node without children (F2 symptom) - the
    // test's own content is missing from this tree.
    const rootNodes = await getFullAXTree();
    expect(rootNodes.find((node: AXNode) => node.role?.value === 'RootWebArea')).toBeDefined();
    expect(rootNodes.some((node: AXNode) => node.role?.value === 'Iframe')).toBe(true);
    expect(rootNodes.some((node: AXNode) => node.name?.value === 'Counter: 5')).toBe(false);

    // Targeting the test frame's frameId returns the iframe's own AX tree.
    const ax = await getFullAXTree(await getTestFrameId());
    expect(ax.some((node: AXNode) => node.role?.value === 'RootWebArea')).toBe(true);
    expect(axFind(ax, 'button')?.name?.value).toBe('Counter: 5');
  });

  it('pierces nested shadow roots in the DOM domain snapshot', async () => {
    await mountCounter();
    await client.send('DOM.enable');
    const {nodes} = await client.send('DOM.getFlattenedDocument', {depth: -1, pierce: true});

    const host = nodes.find((node: {localName?: string}) => node.localName === 'counter-element');
    expect(host).toBeDefined();
    expect(host.shadowRoots.length).toBeGreaterThan(0);

    const materialHost = nodes.find(
      (node: {localName?: string}) => node.localName === 'md-filled-button'
    );
    expect(materialHost).toBeDefined();
    expect(materialHost.shadowRoots.length).toBeGreaterThan(0);

    // `DOM.getFlattenedDocument` pierces the composed tree and reports each
    // shadow root's nodeId. From there `DOM.querySelector` resolves the real
    // <button> that lives two shadow roots deep (getNodeForLocation would only
    // hit the touch-target <span> material overlays).
    const materialShadowRoot = materialHost.shadowRoots[0];
    const {nodeId} = await client.send('DOM.querySelector', {
      nodeId: materialShadowRoot.nodeId,
      selector: 'button',
    });
    expect(nodeId).toBeGreaterThan(0);
    const {node} = await client.send('DOM.describeNode', {nodeId});
    expect(node.localName).toBe('button');
  });

  it('drives a real pointer click with raw Input.dispatchMouseEvent', async () => {
    await mountCounter();
    const el = document.querySelector('counter-element') as CounterElement;

    const button = page.getByRole('button', {name: 'Counter: 5'}).element();
    const rect = button.getBoundingClientRect();
    const x = Math.round(rect.x + rect.width / 2);
    const y = Math.round(rect.y + rect.height / 2);

    await client.send('Input.dispatchMouseEvent', {type: 'mouseMoved', x, y});
    await client.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x,
      y,
      button: 'left',
      clickCount: 1,
    });
    await client.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x,
      y,
      button: 'left',
      clickCount: 1,
    });
    await el.updateComplete;

    expect(el.counter).toBe(6);
    await expect
      .element(page.getByRole('button', {name: 'Counter: 6'}))
      .toHaveAccessibleName('Counter: 6');
  });

  it('emulates prefers-reduced-motion and forced-colors at the protocol level', async () => {
    await mountStepper();
    expect(matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(false);
    expect(matchMedia('(forced-colors: active)').matches).toBe(false);

    try {
      await client.send('Emulation.setEmulatedMedia', {
        media: '',
        features: [
          {name: 'prefers-reduced-motion', value: 'reduce'},
          {name: 'forced-colors', value: 'active'},
        ],
      });
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      expect(matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(true);
      expect(matchMedia('(forced-colors: active)').matches).toBe(true);
    } finally {
      await client.send('Emulation.setEmulatedMedia', {media: '', features: []});
    }

    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(false);
  });

  it('dispatches a composed event whose detail matches the CDP-observed value', async () => {
    const el = await mountStepper();
    const spy = vi.spyOn(el, 'dispatchEvent');

    await userEvent.click(page.getByRole('button', {name: 'Show session panel'}));
    await el.updateComplete;
    await userEvent.click(page.getByRole('button', {name: 'Complete session'}));

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({type: 'session-complete', detail: 4})
    );
  });
});

describe('Accessibility tree snapshots & matching', () => {
  let el: FocusStepper;
  beforeEach(async () => {
    el = await mountStepper();
  });
  afterEach(fixtureCleanup);

  it('exposes the composed ARIA tree as an inline snapshot', async () => {
    await userEvent.click(page.getByRole('button', {name: 'Show session panel'}));
    await el.updateComplete;

    await expect.element(page.elementLocator(el)).toMatchAriaInlineSnapshot(`
      - button "Hide session panel" [expanded]
      - heading "Session progress" [level=2]
      - progressbar "Session progress"
      - button "Complete session"
      - status
    `);
  });

  it('renders the ARIA tree programmatically and tracks updates', async () => {
    await userEvent.click(page.getByRole('button', {name: 'Show session panel'}));
    await el.updateComplete;

    const tree = utils.aria.renderAriaTree(utils.aria.generateAriaTree(el));
    expect(tree).toContain('- progressbar "Session progress"');
    expect(tree).toContain('- status');
    expect(tree).toContain('3 of 10 sessions completed');

    await userEvent.click(page.getByRole('button', {name: 'Complete session'}));
    await el.updateComplete;

    const treeAfter = utils.aria.renderAriaTree(utils.aria.generateAriaTree(el));
    expect(treeAfter).toContain('4 of 10 sessions completed');
  });

  it('keeps matcher-computed and CDP-computed accessible names in sync', async () => {
    fixtureCleanup();
    await mountCounter();

    await expect
      .element(page.getByRole('button', {name: 'Counter: 5'}))
      .toHaveAccessibleName('Counter: 5');

    const ax = await getFullAXTree(await getTestFrameId());
    expect(axFind(ax, 'button')?.name?.value).toBe('Counter: 5');

    await userEvent.click(page.getByRole('button', {name: 'Counter: 5'}));
    const axAfter = await getFullAXTree(await getTestFrameId());
    expect(axFind(axAfter, 'button')?.name?.value).toBe('Counter: 6');
  });
});
