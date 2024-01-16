/* eslint-disable import/no-extraneous-dependencies */
import { beforeAll, afterAll, suite, expect, vi, test } from 'vitest';
import { assert, fixture, fixtureCleanup, html } from '@open-wc/testing';
// import { $ } from '@wdio/globals';
import sinon from 'sinon';
import { structureSnapshot } from './utils.js';
import '../define/counter-element.js';

suite('Lit Component testing', () => {
  /**
   * @type {import('../index').CounterElement}
   */
  let el;
  let elShadowRoot;
  // let el$;

  suite('Default', () => {
    beforeAll(async () => {
      el = await fixture(html`<counter-element>light-dom</counter-element>`);
      elShadowRoot = el?.shadowRoot;
      await el.updateComplete;
      // el$ = await $('counter-element');
    });

    afterAll(() => {
      fixtureCleanup();
    });

    test('has a default heading "Hey there" and counter 5', () => {
      const button = elShadowRoot.querySelector('md-filled-button');
      expect(button?.textContent).toContain('Counter: 5');
    });

    test('SHADOW DOM - Structure test', () => {
      expect(structureSnapshot(elShadowRoot)).toMatchSnapshot('SHADOW DOM');
    });

    test('LIGHT DOM - Structure test', () => {
      expect(structureSnapshot(el, ['id'])).toMatchSnapshot('LIGHT DOM');
    });

    test('a11y', async () => {
      await assert.isAccessible(el);
    });
  });

  suite('Events ', () => {
    beforeAll(async () => {
      el = await fixture(html`<counter-element>light-dom</counter-element>`);
      elShadowRoot = el?.shadowRoot;
      await el.updateComplete;
    });

    afterAll(() => {
      fixtureCleanup();
    });

    test('should increment value on click', async () => {
      const button = elShadowRoot.querySelector('md-filled-button');
      expect(button?.textContent).toContain('Counter: 5');
      button?.click();
      await el.updateComplete;
      button?.click();
      await el.updateComplete;
      expect(button?.textContent).toContain('Counter: 7');
    });

    test('counterchange event is dispatched - sinon', () => {
      const button = elShadowRoot.querySelector('md-filled-button');
      const spy = sinon.spy(el, 'dispatchEvent');
      button?.click();
      const calledWith = spy.calledWith(sinon.match.has('type', 'counterchange'));
      expect(calledWith).toEqual(true);
    });

    test('counterchange event is dispatched - vi.fn', async () => {
      const spyClick = vi.fn();
      const button = elShadowRoot.querySelector('md-filled-button');
      el?.addEventListener('counterchange', spyClick);
      button?.click();
      await el.updateComplete;
      expect(spyClick).toHaveBeenCalled();
    });
  });

  suite('Override ', () => {
    beforeAll(async () => {
      el = await fixture(
        html`<counter-element heading="attribute heading">light-dom</counter-element>`,
      );
      await el.updateComplete;
      elShadowRoot = el?.shadowRoot;
    });

    afterAll(() => {
      fixtureCleanup();
    });

    test('can override the heading via attribute', () => {
      expect(el).toHaveProperty('heading', 'attribute heading');
    });
  });
});
