import {describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi, chai} from 'vitest';
import {type LocatorSelectors, page, utils, cdp} from 'vitest/browser';
import {fixture, fixtureCleanup} from '@open-wc/testing-helpers';
import {chaiA11yAxe} from 'chai-a11y-axe';
import {getDiffableHTML} from '@open-wc/semantic-dom-diff/get-diffable-html.js';
import {html} from 'lit';
import {match, spy /* , useFakeTimers, type SinonFakeTimers */} from 'sinon';
import type {CounterElement} from '../src/CounterElement.js';
import '../src/define/counter-element.js';

chai.use(chaiA11yAxe);

async function getAccessibilityTree(target: HTMLElement) {
  const client = cdp() as {
    send(method: string, params?: Record<string, unknown>): Promise<any>;
  };

  await client.send('Accessibility.enable');
  await client.send('DOM.enable');

  const {nodes} = await client.send('DOM.getFlattenedDocument', {
    depth: -1,
    pierce: true,
  });

  const hostNode = nodes.find((node: any) => node.nodeName === target.nodeName);
  if (!hostNode) {
    throw new Error('Target node not found in accessibility tree');
  }

  const snapshot = await client.send('Accessibility.getPartialAXTree', {
    backendNodeId: hostNode.backendNodeId,
    maxDepth: -1,
    fetchRelatives: true,
  });

  return snapshot.nodes;
}

// https://vitest.dev/guide/browser/context.html#context
// https://main.vitest.dev/guide/browser/locators.html

describe('Lit Component testing', () => {
  let el: CounterElement;
  let elShadowRoot: string;
  let elLocator: LocatorSelectors;
  // let clock: SinonFakeTimers;

  describe('Default', () => {
    beforeAll(async () => {
      el = await fixture(html`
        <counter-element>light-dom</counter-element>
      `);
      elShadowRoot = el?.shadowRoot!.innerHTML;
      elLocator = utils.getElementLocatorSelectors(el);
    });

    afterAll(() => {
      fixtureCleanup();
    });

    it('has a default heading "Hey there" and counter 5', async () => {
      const heading = elLocator.getByRole('heading', {
        level: 1,
        name: 'Hello, Hey there!',
      });
      const button = elLocator.getByRole('button', {
        name: 'Counter: 5',
      });

      await expect.element(heading).toHaveAccessibleName('Hello, Hey there!');
      await expect.element(button).toHaveAccessibleName('Counter: 5');
    });

    it('SHADOW DOM - Structure test', () => {
      expect(getDiffableHTML(elShadowRoot)).toMatchSnapshot('SHADOW DOM');
    });

    it('LIGHT DOM - Structure test', () => {
      expect(getDiffableHTML(el, {ignoreAttributes: ['id']})).toMatchSnapshot('LIGHT DOM');
    });

    it('a11y', async () => {
      await expect(el).accessible();
    });

    it('exposes its composed ARIA tree', async () => {
      // const ariaTree = utils.aria.renderAriaTree(utils.aria.generateAriaTree(el));

      await expect.element(page.elementLocator(el)).toMatchAriaInlineSnapshot(`
       - heading "Hello, Hey there!" [level=1]
       - button "Counter: 5"
       - text: light-dom
     `);
    });

    it('exposes accessible content in the accessibility tree', async () => {
      const nodes = await getAccessibilityTree(el);

      expect(nodes.length).toBeGreaterThan(0);
    });

    it('AX tree', async () => {
      const nodes = await getAccessibilityTree(el);
      const hostAxNode = nodes[0];

      expect(hostAxNode?.role?.value).toBe('none');
      expect(nodes.length).toBeGreaterThan(0);
    });
  });

  describe('Events ', () => {
    beforeEach(async () => {
      el = await fixture(html`
        <counter-element>light-dom</counter-element>
      `);
      elLocator = utils.getElementLocatorSelectors(el);
    });

    afterEach(() => {
      fixtureCleanup();
    });

    it('should increment value on click', async () => {
      const button = elLocator.getByRole('button');

      await expect.element(button).toHaveAccessibleName('Counter: 5');
      await button.dblClick();
      await expect.element(button).toHaveAccessibleName('Counter: 7');
    });

    it('counterchange event is dispatched - sinon', async () => {
      const spyEvent = spy(el, 'dispatchEvent');
      const button = elLocator.getByRole('button', {name: 'Counter: 5', exact: true});
      await button.click();
      const calledWithCounterChange = spyEvent.calledWith(match.has('type', 'counterchange'));
      expect(calledWithCounterChange).toBe(true);
    });

    it('counterchange event is dispatched - vi', async () => {
      const spyEvent = vi.spyOn(el, 'dispatchEvent');
      const button = elLocator.getByRole('button', {name: 'Counter: 5', exact: true});
      await button.click();
      expect(spyEvent).toHaveBeenCalledWith(expect.objectContaining({type: 'counterchange'}));
    });
  });

  describe('Override ', () => {
    beforeEach(async () => {
      el = await fixture(html`
        <counter-element heading="attribute heading"></counter-element>
      `);
      elLocator = utils.getElementLocatorSelectors(el);
    });

    afterEach(() => {
      fixtureCleanup();
    });

    it('can override the heading via attribute', () => {
      expect(el.heading).toBe('attribute heading');
    });
  });
});
