import { html, LitElement } from 'lit';
import { property } from 'lit/decorators.js';
import { styles } from './styles/counter-element-styles.css.js';
import '@material/web/button/filled-button.js';

/**
 * ![Lit](https://img.shields.io/badge/lit-3.0.0-blue.svg)
 *
 * ## `<counter-element>`
 * An example element.
 *
 * @attribute heading
 * @attribute counter
 * @fires counterchange - Indicates when the count changes
 * @slot - This element has a slot
 */
export class CounterElement extends LitElement {
  static override styles = [styles];

  /**
   * The heading to say "Hello" to.
   */
  @property({ type: String })
  heading = 'Hey there';

  /**
   * The number of times the button has been clicked.
   */
  @property({ type: Number })
  counter = 5;

  override render() {
    return html`
      <h1>${this.sayHello(this.heading)}!</h1>
      <md-filled-button @click=${this.#onClick}>Counter: ${this.counter}</md-filled-button>
      <hr />
      <slot></slot>
    `;
  }

  #onClick() {
    this.counter += 1;
    this.dispatchEvent(new CustomEvent('counterchange', { detail: this.counter }));
  }

  /**
   * Formats a greeting
   * @param heading The heading to say "Hello" to
   * @returns {string} A greeting directed at `heading`
   */
  sayHello(heading: string): string {
    return `Hello, ${heading}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'counter-element': CounterElement;
  }
}
