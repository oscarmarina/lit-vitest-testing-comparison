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

async function getCDPClickPointForElement(element: Element): Promise<{x: number; y: number}> {
  await client.send('DOM.enable');

  const {backendNodeId, frameId} = await getCDPNodeForElement(element);

  const {quads} = await client.send('DOM.getContentQuads', {
    backendNodeId,
  });

  if (!quads?.length) {
    throw new Error(`DOM.getContentQuads returned no geometry for backendNodeId ${backendNodeId}`);
  }

  const quad = quads[0] as number[];

  // NOTE: `quads[0]` assumes a single content quad. Inline elements that wrap
  // across lines return several quads; if this helper is generalized to such
  // elements, pick the quad containing the clickable region instead.

  if (quad.length !== 8) {
    throw new Error(`Unexpected quad returned by DOM.getContentQuads: ${JSON.stringify(quad)}`);
  }

  // Quad:
  // [x1, y1, x2, y2, x3, y3, x4, y4]
  //
  // Calculate the center using all four points.
  const x = (quad[0] + quad[2] + quad[4] + quad[6]) / 4;

  const y = (quad[1] + quad[3] + quad[5] + quad[7]) / 4;

  const hit = await client.send('DOM.getNodeForLocation', {
    x: Math.round(x),
    y: Math.round(y),
    includeUserAgentShadowDOM: true,
  });

  if (hit.frameId !== frameId) {
    throw new Error(
      [
        'CDP click coordinates do not land in the target frame.',
        `Expected frame: ${frameId}`,
        `Actual frame: ${hit.frameId}`,
        `Point: ${Math.round(x)}, ${Math.round(y)}`,
        `Target backendNodeId: ${backendNodeId}`,
        `Hit backendNodeId: ${hit.backendNodeId}`,
      ].join('\n')
    );
  }

  return {
    x: Math.round(x),
    y: Math.round(y),
  };
}

/* -------------------------------------------------------------------------- */
/*  CDP                                                                        */
/* -------------------------------------------------------------------------- */

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

  /**
   * Widget values such as progressbar `aria-valuenow` are exposed as the
   * top-level AX `value`.
   */
  value?: {
    type: string;
    value: unknown;
  };

  properties?: {
    name: string;
    value: {
      type: string;
      value: unknown;
    };
  }[];

  childIds?: string[];
}

interface FrameNode {
  frame?: {
    id: string;
    name?: string;
  };

  childFrames?: FrameNode[];
}

interface CDPNodeLocation {
  backendNodeId: number;
  nodeId?: number;
  frameId: string;
}

/* -------------------------------------------------------------------------- */
/*  Frame helpers                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Flattens Page.getFrameTree() into a list of frame IDs.
 *
 * Functional element resolution intentionally does not depend on the
 * `vitest-iframe` name. Instead, every frame can be searched for the temporary
 * marker attached to the exact test DOM element.
 */
function collectFrameIds(node: FrameNode, frameIds: string[] = []): string[] {
  if (node.frame?.id) {
    frameIds.push(node.frame.id);
  }

  for (const child of node.childFrames ?? []) {
    collectFrameIds(child, frameIds);
  }

  return frameIds;
}

/**
 * Returns the frame currently used by Vitest's test document.
 *
 * This helper exists only for the topology/full-tree tests. Functional tests
 * resolve the frame from the actual element instead.
 */
async function getTestFrameId(): Promise<string> {
  await client.send('Page.enable');

  const {frameTree} = await client.send('Page.getFrameTree');

  const findTestFrame = (node: FrameNode): string | undefined => {
    if (node.frame?.name === 'vitest-iframe') {
      return node.frame.id;
    }

    for (const child of node.childFrames ?? []) {
      const frameId = findTestFrame(child);

      if (frameId) {
        return frameId;
      }
    }

    return undefined;
  };

  const frameId = findTestFrame(frameTree);

  if (!frameId) {
    throw new Error('Vitest test iframe not found in Page.getFrameTree');
  }

  return frameId;
}

/* -------------------------------------------------------------------------- */
/*  AX helpers                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Returns the complete accessibility tree for the requested frame.
 *
 * Without a frameId, CDP targets the root/orchestrator frame.
 */
async function getFullAXTree(frameId?: string): Promise<AXNode[]> {
  await client.send('Accessibility.enable');

  const {nodes} = await client.send('Accessibility.getFullAXTree', {
    ...(frameId ? {frameId} : {}),
  });

  return nodes as AXNode[];
}

/**
 * Returns the local AX subtree around an exact backend DOM node.
 */
async function getPartialAXTree(backendNodeId: number): Promise<AXNode[]> {
  await client.send('Accessibility.enable');

  const {nodes} = await client.send('Accessibility.getPartialAXTree', {
    backendNodeId,
    fetchRelatives: true,
  });

  return nodes as AXNode[];
}

/**
 * Finds a non-ignored AX node by role and optionally accessible name.
 */
function axFind(nodes: AXNode[], role: string, name?: string): AXNode | undefined {
  return nodes.find(
    (node) =>
      !node.ignored &&
      node.role?.value === role &&
      (name === undefined || node.name?.value === name)
  );
}

function axProperty(node: AXNode, name: string): unknown {
  return node.properties?.find((property) => property.name === name)?.value.value;
}

/**
 * progressbar/scrollbar expose their current value at the top level.
 */
function axValue(node: AXNode): unknown {
  return node.value?.value;
}

/* -------------------------------------------------------------------------- */
/*  Exact DOM element -> CDP node                                             */
/* -------------------------------------------------------------------------- */

/**
 * Resolves an exact DOM element to its CDP backend node.
 *
 * This deliberately does NOT use DOM.getNodeForLocation().
 *
 * getNodeForLocation() is a hit-test. With nested shadow DOM and component
 * overlays, the node under the pointer can be a descendant/overlay rather than
 * the exact element represented by the Vitest locator.
 *
 * Instead:
 *
 *   1. Add a unique temporary marker to the exact DOM element.
 *   2. Inspect the browser frame tree.
 *   3. Create an isolated world in each frame.
 *   4. Search recursively through open shadow roots for that marker.
 *   5. Runtime.evaluate() returns the exact element's RemoteObject.
 *   6. DOM.describeNode({objectId}) returns its backendNodeId.
 *
 * This makes element -> CDP correlation deterministic and independent of
 * geometry or the `vitest-iframe` frame name.
 */
async function getCDPNodeForElement(element: Element): Promise<CDPNodeLocation> {
  await client.send('Page.enable');
  await client.send('DOM.enable');

  const markerName = 'data-vitest-cdp-target';

  const markerValue = `vitest-cdp-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  element.setAttribute(markerName, markerValue);

  try {
    const {frameTree} = await client.send('Page.getFrameTree');

    const frameIds = collectFrameIds(frameTree);

    for (const frameId of frameIds) {
      const {executionContextId} = await client.send('Page.createIsolatedWorld', {
        frameId,
        worldName: '__vitest_cdp_element_lookup__',
        grantUniveralAccess: true,
      });

      const expression = `
        (() => {
          const markerName = ${JSON.stringify(markerName)};
          const markerValue = ${JSON.stringify(markerValue)};

          const selector =
            '[' +
            markerName +
            '="' +
            markerValue +
            '"]';

          const findDeep = (root) => {
            const direct = root.querySelector?.(selector);

            if (direct) {
              return direct;
            }

            for (const candidate of root.querySelectorAll?.('*') ?? []) {
              if (candidate.shadowRoot) {
                const found = findDeep(candidate.shadowRoot);

                if (found) {
                  return found;
                }
              }
            }

            return null;
          };

          return findDeep(document);
        })()
      `;

      const {result, exceptionDetails} = await client.send('Runtime.evaluate', {
        expression,
        contextId: executionContextId,
        returnByValue: false,
        awaitPromise: false,
      });

      if (exceptionDetails) {
        throw new Error(
          `Runtime.evaluate failed while resolving the CDP element: ${
            exceptionDetails.text ?? 'unknown error'
          }`
        );
      }

      if (!result?.objectId) {
        continue;
      }

      try {
        const {node} = await client.send('DOM.describeNode', {
          objectId: result.objectId,
        });

        if (!node?.backendNodeId) {
          throw new Error('DOM.describeNode did not return a backendNodeId');
        }

        return {
          backendNodeId: node.backendNodeId as number,
          nodeId: node.nodeId as number | undefined,
          frameId,
        };
      } finally {
        await client.send('Runtime.releaseObject', {
          objectId: result.objectId,
        });
      }
    }

    throw new Error('Could not find the marked DOM element in any browser frame');
  } finally {
    element.removeAttribute(markerName);
  }
}

/**
 * Resolves a concrete element directly to its corresponding AX node.
 */
async function getAXNodeForElement(
  element: Element,
  role: string,
  name?: string
): Promise<AXNode | undefined> {
  const {backendNodeId} = await getCDPNodeForElement(element);

  const nodes = await getPartialAXTree(backendNodeId);

  return axFind(nodes, role, name);
}

/* -------------------------------------------------------------------------- */
/*  Tests                                                                     */
/* -------------------------------------------------------------------------- */

describe('ARIA locators pierce nested Shadow DOM', () => {
  beforeEach(mountCounter);

  afterEach(fixtureCleanup);

  it('finds the internal <h1> by role, level and accessible name', async () => {
    const heading = page.getByRole('heading', {
      level: 1,
      name: 'Hello, Hey there!',
    });

    await expect.element(heading).toHaveRole('heading');

    await expect.element(heading).toHaveAccessibleName('Hello, Hey there!');

    await expect.element(heading).toHaveTextContent('Hello, Hey there!');
  });

  it('reaches the button two shadow roots deep (counter-element -> md-filled-button)', async () => {
    const button = page.getByRole('button', {
      name: 'Counter: 5',
    });

    await expect.element(button).toBeEnabled();

    await expect.element(button).toHaveAccessibleName('Counter: 5');
  });

  it('prunes aria-hidden nodes but keeps composed slotted light DOM', async () => {
    const el = document.querySelector('counter-element')!;

    expect(page.getByRole('separator').query()).toBeNull();

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
    const collapsed = page.getByRole('button', {
      name: 'Show session panel',
      expanded: false,
    });

    await expect.element(collapsed).toBeVisible();

    await userEvent.click(collapsed);

    await el.updateComplete;

    expect(
      page
        .getByRole('button', {
          name: 'Show session panel',
          expanded: false,
        })
        .query()
    ).toBeNull();

    const expanded = page.getByRole('button', {
      name: 'Hide session panel',
      expanded: true,
    });

    await expect.element(expanded).toHaveAttribute('aria-expanded', 'true');

    await expect
      .element(
        page.getByRole('progressbar', {
          name: 'Session progress',
        })
      )
      .toBeVisible();
  });

  it('collapses the panel and hides the inner controls again', async () => {
    await userEvent.click(
      page.getByRole('button', {
        name: 'Show session panel',
      })
    );

    await el.updateComplete;

    await expect
      .element(
        page.getByRole('progressbar', {
          name: 'Session progress',
        })
      )
      .toBeVisible();

    await userEvent.click(
      page.getByRole('button', {
        name: 'Hide session panel',
      })
    );

    await el.updateComplete;

    await expect
      .element(
        page.getByRole('button', {
          name: 'Show session panel',
          expanded: false,
        })
      )
      .toHaveAttribute('aria-expanded', 'false');

    expect(
      page
        .getByRole('progressbar', {
          name: 'Session progress',
        })
        .query()
    ).toBeNull();
  });

  it('filters by disabled state', async () => {
    await userEvent.click(
      page.getByRole('button', {
        name: 'Show session panel',
      })
    );

    await el.updateComplete;

    el.disabled = true;

    await el.updateComplete;

    await expect
      .element(
        page.getByRole('button', {
          name: 'Complete session',
          disabled: true,
        })
      )
      .toBeDisabled();

    await expect
      .element(
        page.getByRole('button', {
          name: 'Hide session panel',
          disabled: true,
        })
      )
      .toBeDisabled();

    await expect
      .element(
        page.getByRole('progressbar', {
          name: 'Session progress',
        })
      )
      .toHaveAttribute('aria-disabled', 'true');

    expect(
      page
        .getByRole('button', {
          name: 'Complete session',
          disabled: false,
        })
        .query()
    ).toBeNull();
  });

  it('lets includeHidden find collapsed-but-rendered controls', async () => {
    expect(
      page
        .getByRole('progressbar', {
          name: 'Session progress',
        })
        .query()
    ).toBeNull();

    await expect
      .element(
        page.getByRole('progressbar', {
          name: 'Session progress',
          includeHidden: true,
        })
      )
      .toHaveAttribute('aria-valuenow', '3');
  });

  it('propagates value changes into aria-valuenow and the live region', async () => {
    await userEvent.click(
      page.getByRole('button', {
        name: 'Show session panel',
      })
    );

    await el.updateComplete;

    const meter = page.getByRole('progressbar', {
      name: 'Session progress',
    });

    await expect.element(meter).toHaveAttribute('aria-valuenow', '3');

    await expect.element(meter).toHaveAttribute('aria-valuetext', '3 of 10 sessions completed');

    await expect.element(page.getByRole('status')).toHaveTextContent('3 of 10 sessions completed');

    await userEvent.click(
      page.getByRole('button', {
        name: 'Complete session',
      })
    );

    await el.updateComplete;

    await expect.element(meter).toHaveAttribute('aria-valuenow', '4');

    await expect.element(page.getByRole('status')).toHaveTextContent('4 of 10 sessions completed');
  });

  it('locates the progressbar through its label', async () => {
    await userEvent.click(
      page.getByRole('button', {
        name: 'Show session panel',
      })
    );

    await expect
      .element(page.getByLabelText('Session progress'))
      .toHaveAttribute('aria-valuenow', '3');
  });

  it('reflects counter changes in the accessible name of the material button', async () => {
    fixtureCleanup();

    await mountCounter();

    await userEvent.click(
      page.getByRole('button', {
        name: 'Counter: 5',
      })
    );

    await expect
      .element(
        page.getByRole('button', {
          name: 'Counter: 6',
        })
      )
      .toHaveAccessibleName('Counter: 6');
  });
});

describe('Real user interactions (userEvent)', () => {
  afterEach(fixtureCleanup);

  it('increments with a real pointer click and double click', async () => {
    await mountCounter();

    await userEvent.click(
      page.getByRole('button', {
        name: 'Counter: 5',
      })
    );

    await expect
      .element(
        page.getByRole('button', {
          name: 'Counter: 6',
        })
      )
      .toBeVisible();

    await userEvent.dblClick(
      page.getByRole('button', {
        name: 'Counter: 6',
      })
    );

    await expect
      .element(
        page.getByRole('button', {
          name: 'Counter: 8',
        })
      )
      .toBeVisible();
  });

  it('activates a focused button with Space and Enter', async () => {
    const el = await mountStepper();

    await userEvent.tab();

    expect(el.shadowRoot?.activeElement?.id).toBe('toggle');

    await userEvent.keyboard('{Enter}');

    await el.updateComplete;

    await expect
      .element(
        page.getByRole('button', {
          name: 'Hide session panel',
        })
      )
      .toBeVisible();

    expect(el.shadowRoot?.activeElement?.id).toBe('complete');

    await userEvent.keyboard(' ');

    await el.updateComplete;

    await expect
      .element(
        page.getByRole('progressbar', {
          name: 'Session progress',
        })
      )
      .toHaveAttribute('aria-valuenow', '4');
  });

  it('supports arrow-key adjustment on the focused progressbar', async () => {
    const el = await mountStepper();

    await userEvent.click(
      page.getByRole('button', {
        name: 'Show session panel',
      })
    );

    await el.updateComplete;

    await userEvent.keyboard('{Shift>}{Tab}{/Shift}');

    expect(el.shadowRoot?.activeElement?.id).toBe('meter');

    const meter = page.getByRole('progressbar', {
      name: 'Session progress',
    });

    await userEvent.keyboard('{ArrowRight}');

    await el.updateComplete;

    await expect.element(meter).toHaveAttribute('aria-valuenow', '4');

    await userEvent.keyboard('{ArrowLeft}');

    await el.updateComplete;

    await expect.element(meter).toHaveAttribute('aria-valuenow', '3');

    await userEvent.keyboard('a');

    await el.updateComplete;

    await expect.element(meter).toHaveAttribute('aria-valuenow', '3');
  });

  it('increments the complete button by step', async () => {
    const el = await fixture<FocusStepper>(html`
      <focus-stepper step="2" max="5" expanded></focus-stepper>
    `);

    await el.updateComplete;

    await userEvent.click(
      page.getByRole('button', {
        name: 'Complete session',
      })
    );

    await el.updateComplete;

    expect(el.value).toBe(5);

    await userEvent.click(
      page.getByRole('button', {
        name: 'Complete session',
      })
    );

    await el.updateComplete;

    expect(el.value).toBe(5);
  });

  it('applies and releases real pointer hover state', async () => {
    await mountCounter();

    const button = page.getByRole('button', {
      name: 'Counter: 5',
    });

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

    await userEvent.click(
      page.getByRole('button', {
        name: 'Show session panel',
      })
    );

    await el.updateComplete;

    const getMeter = async () =>
      getAXNodeForElement(
        page
          .getByRole('progressbar', {
            name: 'Session progress',
          })
          .element(),
        'progressbar',
        'Session progress'
      );

    const meter = await getMeter();

    expect(meter).toBeDefined();

    expect(meter?.name?.value).toBe('Session progress');

    expect(axValue(meter!)).toBe(3);

    expect(axProperty(meter!, 'valuemax')).toBe(10);

    expect(axProperty(meter!, 'focusable')).toBe(true);

    await userEvent.click(
      page.getByRole('button', {
        name: 'Complete session',
      })
    );

    await el.updateComplete;

    const updatedMeter = await getMeter();

    expect(updatedMeter).toBeDefined();

    expect(axValue(updatedMeter!)).toBe(4);
  });

  it('audits the live accessible name of the material button', async () => {
    await mountCounter();

    const getButton = async (name: string) =>
      getAXNodeForElement(page.getByRole('button', {name}).element(), 'button', name);

    const buttonAx = await getButton('Counter: 5');

    expect(buttonAx).toBeDefined();

    expect(buttonAx?.name?.value).toBe('Counter: 5');

    expect(axProperty(buttonAx!, 'focusable')).toBe(true);

    await userEvent.click(
      page.getByRole('button', {
        name: 'Counter: 5',
      })
    );

    const buttonAfter = await getButton('Counter: 6');

    expect(buttonAfter).toBeDefined();

    expect(buttonAfter?.name?.value).toBe('Counter: 6');
  });

  it('discovers the browser frame hierarchy (root runner + test iframe)', async () => {
    await client.send('Page.enable');

    const {frameTree} = await client.send('Page.getFrameTree');

    expect(frameTree.frame.id).toBeTruthy();

    expect(frameTree.childFrames?.length ?? 0).toBeGreaterThan(0);

    const testFrameId = await getTestFrameId();

    expect(testFrameId).not.toBe(frameTree.frame.id);

    const findFrame = (node: FrameNode): FrameNode | undefined => {
      if (node.frame?.id === testFrameId) {
        return node;
      }

      for (const child of node.childFrames ?? []) {
        const found = findFrame(child);

        if (found) {
          return found;
        }
      }

      return undefined;
    };

    expect(findFrame(frameTree)?.frame?.name).toBe('vitest-iframe');
  });

  it('reaches the test AX tree via Accessibility.getFullAXTree({frameId})', async () => {
    await mountCounter();

    const rootNodes = await getFullAXTree();

    expect(rootNodes.some((node) => node.role?.value === 'RootWebArea')).toBe(true);

    expect(rootNodes.some((node) => node.role?.value === 'Iframe')).toBe(true);

    expect(rootNodes.some((node) => node.name?.value === 'Counter: 5')).toBe(false);

    const testFrameId = await getTestFrameId();

    const testNodes = await getFullAXTree(testFrameId);

    expect(testNodes.some((node) => node.role?.value === 'RootWebArea')).toBe(true);

    const button = axFind(testNodes, 'button', 'Counter: 5');

    expect(button?.name?.value).toBe('Counter: 5');
  });

  it('pierces nested shadow roots in the DOM domain snapshot', async () => {
    await mountCounter();

    await client.send('DOM.enable');

    const {nodes} = await client.send('DOM.getFlattenedDocument', {
      depth: -1,
      pierce: true,
    });

    const host = nodes.find((node: {localName?: string}) => node.localName === 'counter-element');

    expect(host).toBeDefined();

    expect(host.shadowRoots.length).toBeGreaterThan(0);

    const materialHost = nodes.find(
      (node: {localName?: string}) => node.localName === 'md-filled-button'
    );

    expect(materialHost).toBeDefined();

    expect(materialHost.shadowRoots.length).toBeGreaterThan(0);

    const materialShadowRoot = materialHost.shadowRoots[0];

    const {nodeId} = await client.send('DOM.querySelector', {
      nodeId: materialShadowRoot.nodeId,
      selector: 'button',
    });

    expect(nodeId).toBeGreaterThan(0);

    const {node} = await client.send('DOM.describeNode', {
      nodeId,
    });

    expect(node.localName).toBe('button');
  });

  it('drives a real pointer click with raw Input.dispatchMouseEvent', async () => {
    await mountCounter();

    const el = document.querySelector('counter-element') as CounterElement;

    const button = page
      .getByRole('button', {
        name: 'Counter: 5',
      })
      .element();

    const {x, y} = await getCDPClickPointForElement(button);

    const events: string[] = [];

    button.addEventListener('pointerdown', () => events.push('pointerdown'));

    button.addEventListener('mousedown', () => events.push('mousedown'));

    button.addEventListener('pointerup', () => events.push('pointerup'));

    button.addEventListener('mouseup', () => events.push('mouseup'));

    button.addEventListener('click', () => events.push('click'));

    el.addEventListener('click', () => events.push('host-click'));

    /*
  console.log({
    tagName: button.tagName,
    localName: button.localName,
    outerHTML: button.outerHTML,
    root:
      button.getRootNode() instanceof ShadowRoot
        ? 'shadow-root'
        : 'document',
  }); */

    await client.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x,
      y,
    });

    await client.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x,
      y,
      button: 'left',
      buttons: 1,
      clickCount: 1,
    });

    await client.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x,
      y,
      button: 'left',
      buttons: 0,
      clickCount: 1,
    });

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });

    await el.updateComplete;

    expect(events).toContain('pointerdown');
    expect(events).toContain('mousedown');
    expect(events).toContain('pointerup');
    expect(events).toContain('mouseup');
    expect(events).toContain('click');

    expect(el.counter).toBe(6);
  });

  it('emulates prefers-reduced-motion and forced-colors at the protocol level', async () => {
    await mountStepper();

    expect(matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(false);

    expect(matchMedia('(forced-colors: active)').matches).toBe(false);

    try {
      await client.send('Emulation.setEmulatedMedia', {
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
      });

      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      expect(matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(true);

      expect(matchMedia('(forced-colors: active)').matches).toBe(true);
    } finally {
      await client.send('Emulation.setEmulatedMedia', {
        media: '',
        features: [],
      });
    }

    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    expect(matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(false);
  });

  it('dispatches a composed event whose detail matches the CDP-observed value', async () => {
    const el = await mountStepper();

    const spy = vi.spyOn(el, 'dispatchEvent');

    await userEvent.click(
      page.getByRole('button', {
        name: 'Show session panel',
      })
    );

    await el.updateComplete;

    await userEvent.click(
      page.getByRole('button', {
        name: 'Complete session',
      })
    );

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'session-complete',
        detail: 4,
      })
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
    await userEvent.click(
      page.getByRole('button', {
        name: 'Show session panel',
      })
    );

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
    await userEvent.click(
      page.getByRole('button', {
        name: 'Show session panel',
      })
    );

    await el.updateComplete;

    const tree = utils.aria.renderAriaTree(utils.aria.generateAriaTree(el));

    expect(tree).toContain('- progressbar "Session progress"');

    expect(tree).toContain('- status');

    expect(tree).toContain('3 of 10 sessions completed');

    await userEvent.click(
      page.getByRole('button', {
        name: 'Complete session',
      })
    );

    await el.updateComplete;

    const treeAfter = utils.aria.renderAriaTree(utils.aria.generateAriaTree(el));

    expect(treeAfter).toContain('4 of 10 sessions completed');
  });

  it('keeps matcher-computed and CDP-computed accessible names in sync', async () => {
    fixtureCleanup();

    await mountCounter();

    const getButton = (name: string) => page.getByRole('button', {name});

    const button = getButton('Counter: 5');

    await expect.element(button).toHaveAccessibleName('Counter: 5');

    const buttonAx = await getAXNodeForElement(button.element(), 'button', 'Counter: 5');

    expect(buttonAx).toBeDefined();

    expect(buttonAx?.name?.value).toBe('Counter: 5');

    await userEvent.click(button);

    const updatedButton = getButton('Counter: 6');

    await expect.element(updatedButton).toHaveAccessibleName('Counter: 6');

    const updatedButtonAx = await getAXNodeForElement(
      updatedButton.element(),
      'button',
      'Counter: 6'
    );

    expect(updatedButtonAx).toBeDefined();

    expect(updatedButtonAx?.name?.value).toBe('Counter: 6');
  });
});
