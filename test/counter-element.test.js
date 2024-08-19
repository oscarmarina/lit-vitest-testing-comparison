/* eslint-disable import/no-extraneous-dependencies */
import { beforeEach, afterEach, suite, expect, vi, test, assert } from 'vitest';
import { assert as a11y, fixture, fixtureCleanup, html } from '@open-wc/testing';
import { page, userEvent } from '@vitest/browser/context';
import sinon from 'sinon';
import { structureSnapshot } from './utils.js';
import '../define/counter-element.js';

// https://vitest.dev/guide/browser/context.html#context

// https://main.vitest.dev/guide/browser/locators.html

suite('Lit Component testing', () => {
  /**
   * @type {import('../src/index').CounterElement}
   */
  let el;
  let elShadowRoot;
  let elLocator;

  suite('Default', () => {
    beforeEach(async () => {
      el = await fixture(html`
        <counter-element>light-dom</counter-element>
      `);
      elShadowRoot = el?.shadowRoot;
      elLocator = page.elementLocator(el);
    });

    afterEach(() => {
      fixtureCleanup();
    });

    test('has a default heading "Hey there" and counter 5', async () => {
      const button = await elLocator.getByText('Counter: 5').query();
      const heading = await elLocator.getByText('Hey there').query();
      expect(button).toBeTruthy();
      expect(heading).toBeTruthy();
    });

    test('SHADOW DOM - Structure test', () => {
      expect(structureSnapshot(elShadowRoot)).toMatchSnapshot('SHADOW DOM');
    });

    test('LIGHT DOM - Structure test', () => {
      expect(structureSnapshot(el, ['id'])).toMatchSnapshot('LIGHT DOM');
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
      elShadowRoot = el?.shadowRoot;
      elLocator = page.elementLocator(el);
    });

    afterEach(() => {
      fixtureCleanup();
    });

    test('should increment value on click', async () => {
      const button = elLocator.getByText('Counter: 5');
      const elButton = button.query();
      await button.dblClick();
      await el.updateComplete;
      expect(elButton.textContent).toContain('Counter: 7');
    });

    test('counterchange event is dispatched - sinon', async () => {
      const button = elShadowRoot.querySelector('md-filled-button');
      const spy = sinon.spy(el, 'dispatchEvent');
      await userEvent.click(button);
      const calledWith = spy.calledWith(sinon.match.has('type', 'counterchange'));
      assert.isTrue(calledWith);
    });

    test('counterchange event is dispatched - vi.fn', async () => {
      const spyClick = vi.fn();
      const button = elShadowRoot.querySelector('md-filled-button');
      el?.addEventListener('counterchange', spyClick);
      await userEvent.click(button);
      await el.updateComplete;
      expect(spyClick).toHaveBeenCalled();
    });
  });

  suite('Override ', () => {
    beforeEach(async () => {
      el = await fixture(html`
        <counter-element heading="attribute heading"></counter-element>
      `);
      elShadowRoot = el?.shadowRoot;
      elLocator = page.elementLocator(el);
    });

    afterEach(() => {
      fixtureCleanup();
    });

    test('can override the heading via attribute', () => {
      expect(el).toHaveProperty('heading', 'attribute heading');
    });
  });
});
