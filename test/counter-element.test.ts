import { beforeAll, afterAll, suite, expect, vi, test, assert } from 'vitest';
import { assert as a11y, fixture, fixtureCleanup } from '@open-wc/testing';
import { html } from 'lit/static-html.js';
import sinon from 'sinon';
import { structureSnapshot } from './utils.js';
import { CounterElement } from '../src/CounterElement.js';
import '../define/counter-element.js';

suite('Lit Component testing', () => {
  let el: CounterElement;
  let elShadowRoot: ShadowRoot;

  suite('Default', () => {
    beforeAll(async () => {
      el = await fixture(html`<counter-element>light-dom</counter-element>`);
      elShadowRoot = el.shadowRoot!;
      // el$ = await $('counter-element');
    });

    afterAll(() => {
      fixtureCleanup();
    });

    test('has a default heading "Hey there" and counter 5', () => {
      const button = elShadowRoot?.querySelector('md-filled-button');
      expect(button?.textContent).toContain('Counter: 5');
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
    beforeAll(async () => {
      el = await fixture(html`<counter-element>light-dom</counter-element>`);
      elShadowRoot = el.shadowRoot!;
    });

    afterAll(() => {
      fixtureCleanup();
    });

    test('should increment value on click', async () => {
      const button = elShadowRoot?.querySelector('md-filled-button');
      expect(button?.textContent).toContain('Counter: 5');
      button?.click();
      await el.updateComplete;
      button?.click();
      await el.updateComplete;
      expect(button?.textContent).toContain('Counter: 7');
    });

    test('counterchange event is dispatched - sinon', () => {
      const button = elShadowRoot?.querySelector('md-filled-button');
      const spy = sinon.spy(el, 'dispatchEvent');
      button?.click();
      const calledWith = spy.calledWith(sinon.match.has('type', 'counterchange'));
      assert.isTrue(calledWith);
    });

    test('counterchange event is dispatched - vi.fn', async () => {
      const spyClick = vi.fn();
      const button = elShadowRoot?.querySelector('md-filled-button');
      el?.addEventListener('counterchange', spyClick);
      button?.click();
      await el.updateComplete;
      expect(spyClick).toHaveBeenCalled();
    });
  });

  suite('Override ', () => {
    beforeAll(async () => {
      el = await fixture(html`<counter-element heading="attribute heading"></counter-element>`);
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
