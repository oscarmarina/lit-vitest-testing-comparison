import {suite, test, assert, expect, beforeAll, afterAll, beforeEach, afterEach, vi} from 'vitest';
import {assert as a11y, fixture, fixtureCleanup} from '@open-wc/testing';
import {getDiffableHTML} from '@open-wc/semantic-dom-diff';
import {html} from 'lit';
import {match, spy} from 'sinon';
import {page, userEvent, type Locator} from '@vitest/browser/context';
import {CounterElement} from '../src/CounterElement.js';
import '../src/define/counter-element.js';

// https://vitest.dev/guide/browser/context.html#context
// https://main.vitest.dev/guide/browser/locators.html

suite('Lit Component testing', () => {
  let el: CounterElement;
  let elShadowRoot: string;
  let elLocator: Locator;

  suite('Default', () => {
    beforeAll(async () => {
      el = await fixture(html`
        <counter-element>light-dom</counter-element>
      `);
      elShadowRoot = el?.shadowRoot!.innerHTML;
      elLocator = page.elementLocator(el);
    });

    afterAll(() => {
      fixtureCleanup();
    });

    test('has a default heading "Hey there" and counter 5', async () => {
      const button = await elLocator.getByText('Counter: 5').query();
      const heading = await elLocator.getByText('Hey there').query();
      assert.isOk(button);
      assert.isOk(heading);
    });

    test('SHADOW DOM - Structure test', () => {
      expect(getDiffableHTML(elShadowRoot)).toMatchSnapshot('SHADOW DOM');
    });

    test('LIGHT DOM - Structure test', () => {
      expect(getDiffableHTML(el, {ignoreAttributes: ['id']})).toMatchSnapshot('LIGHT DOM');
    });

    test('a11y', async () => {
      await a11y.isAccessible(el);
    });
  });

  suite('Events ', () => {
    beforeEach(async () => {
      el = await fixture(html`
        <counter-element>light-dom</counter-element>
      `);
      elLocator = page.elementLocator(el);
    });

    afterEach(() => {
      fixtureCleanup();
    });

    test('should increment value on click', async () => {
      const button = elLocator.getByText('Counter: 5');
      const elButton = button.query()!;
      await button.dblClick();
      await el.updateComplete;
      assert.include(elButton.textContent, 'Counter: 7');
    });

    test('counterchange event is dispatched - sinon', async () => {
      const spyEvent = spy(el, 'dispatchEvent');
      const button = elLocator.getByText('Counter: 5');
      const elButton = button.query()!;
      await userEvent.click(elButton);
      const calledWith = spyEvent.calledWith(match.has('type', 'counterchange'));
      assert.isTrue(calledWith);
    });

    test('counterchange event is dispatched - vi', async () => {
      const spyEvent = vi.spyOn(el, 'dispatchEvent');
      const button = elLocator.getByText('Counter: 5');
      const elButton = button.query()!;
      await userEvent.click(elButton);
      await el.updateComplete;
      const calledWithCounterChange = spyEvent.mock.lastCall?.[0].type === 'counterchange';
      assert.isTrue(calledWithCounterChange);
    });
  });

  suite('Override ', () => {
    beforeEach(async () => {
      el = await fixture(html`
        <counter-element heading="attribute heading"></counter-element>
      `);
      elLocator = page.elementLocator(el);
    });

    afterEach(() => {
      fixtureCleanup();
    });

    test('can override the heading via attribute', () => {
      assert.equal(el.heading, 'attribute heading');
    });
  });
});
