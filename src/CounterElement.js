import {html, LitElement} from 'lit';
import '@material/web/button/filled-button.js';
import {styles} from './styles/counter-element-styles.css.js';

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
  /**
   * @override
   */
  static styles = [styles];

  /**
   * @override
   */
  static properties = {
    /**
     * The heading to say "Hello" to.
     */
    heading: {type: String},

    /**
     * The number of times the button has been clicked.
     */
    counter: {type: Number},
  };

  constructor() {
    super();
    this.heading = 'Hey there';
    this.counter = 5;
  }

  /**
   * @override
   */
  render() {
    return html`
      <h1>
        ${this.sayHello(this.heading)}
        <span>!</span>
      </h1>
      <md-filled-button @click=${this.#onClick}>Counter: ${this.counter}</md-filled-button>
      <hr />
      <slot></slot>
    `;
  }

  #onClick() {
    this.counter += 1;
    this.dispatchEvent(new CustomEvent('counterchange', {detail: this.counter}));
  }

  /**
   * Formats a greeting
   * @param heading {string} The heading to say "Hello" to
   * @returns {string} A greeting directed at `heading`
   */
  sayHello(heading) {
    return `Hello, ${heading}`;
  }
}
