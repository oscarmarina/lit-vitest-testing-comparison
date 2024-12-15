import {beforeAll, afterAll, suite, expect, vi, test, assert} from 'vitest';
import {assert as a11y, fixture, fixtureCleanup} from '@open-wc/testing';
import {getDiffableHTML} from '@open-wc/semantic-dom-diff';
import {html} from 'lit';
import {match, spy} from 'sinon';
import {userEvent} from '@vitest/browser/context';
import {CounterElement} from '../src/CounterElement.js';
import '../src/define/counter-element.js';

// https://vitest.dev/guide/browser/context.html#context
// https://main.vitest.dev/guide/browser/locators.html

suite('Lit Component testing', () => {
  let el: CounterElement;
  let elShadowRoot: ShadowRoot;

  suite('Default', () => {
    beforeAll(async () => {
      el = await fixture(html`
        <counter-element>light-dom</counter-element>
      `);
      elShadowRoot = el.shadowRoot!;
    });

    afterAll(() => {
      fixtureCleanup();
    });

    test('has a default heading "Hey there" and counter 5', () => {
      const button = elShadowRoot.querySelector('md-filled-button');
      expect(button?.textContent).toContain('Counter: 5');
    });

    test('SHADOW DOM - Structure test', () => {
      expect(getDiffableHTML(elShadowRoot.innerHTML)).toMatchSnapshot('SHADOW DOM');
    });

    test('LIGHT DOM - Structure test', () => {
      expect(getDiffableHTML(el, {ignoreAttributes: ['id']})).toMatchSnapshot('LIGHT DOM');
    });

    test('a11y', async () => {
      await a11y.isAccessible(el);
    });
  });

  suite('Events ', () => {
    beforeAll(async () => {
      el = await fixture(html`
        <counter-element>light-dom</counter-element>
      `);
      elShadowRoot = el.shadowRoot!;
    });

    afterAll(() => {
      fixtureCleanup();
    });

    test('should increment value on click', async () => {
      const button = elShadowRoot.querySelector('md-filled-button')!;
      expect(button?.textContent).toContain('Counter: 5');
      await userEvent.click(button);
      await el.updateComplete;
      await userEvent.click(button);
      await el.updateComplete;
      expect(button?.textContent).toContain('Counter: 7');
    });

    test('counterchange event is dispatched - sinon', async () => {
      const button = elShadowRoot.querySelector('md-filled-button')!;
      const spyEvent = spy(el, 'dispatchEvent');
      await userEvent.click(button);
      const calledWith = spyEvent.calledWith(match.has('type', 'counterchange'));
      assert.isTrue(calledWith);
    });

    test('counterchange event is dispatched - vi.fn', async () => {
      const spyClick = vi.fn();
      const button = elShadowRoot.querySelector('md-filled-button')!;
      el?.addEventListener('counterchange', spyClick);
      await userEvent.click(button);
      await el.updateComplete;
      expect(spyClick).toHaveBeenCalled();
    });
  });

  suite('Override ', () => {
    beforeAll(async () => {
      el = await fixture(html`
        <counter-element heading="attribute heading"></counter-element>
      `);
      elShadowRoot = el.shadowRoot!;
    });

    afterAll(() => {
      fixtureCleanup();
    });

    test('can override the heading via attribute', () => {
      expect(el).toHaveProperty('heading', 'attribute heading');
    });
  });
});
