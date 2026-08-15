import {css, html, LitElement} from 'lit';
import {property} from 'lit/decorators.js';

/* eslint-disable lit-a11y/role-supports-aria-attr -- the progressbar
   intentionally carries aria-disabled so the suite can document that the
   disabled role filter ignores aria-disabled on non-button widgets.
   See VITEST_5_FIELD_GUIDE.md F4. */

/**
 * ![Lit](https://img.shields.io/badge/lit-3.0.0-blue.svg)
 *
 * ## `<focus-stepper>`
 * A self-contained Lit component that exercises an ARIA state matrix:
 * an `aria-expanded` disclosure, a `role=progressbar` with
 * `aria-valuemin/valuemax/valuenow/valuetext`, an `aria-live` status region
 * and keyboard-only focus management.
 *
 * @attribute value - The current progress value.
 * @attribute max - The maximum progress value.
 * @attribute step - The increment applied by the arrow keys.
 * @attribute disabled - Disables the toggle and complete buttons.
 * @attribute expanded - Whether the session panel is expanded.
 * @fires session-complete - Indicates when a session is completed.
 */
export class FocusStepper extends LitElement {
  static override styles = css`
    :host {
      display: block;
      font-family: system-ui, sans-serif;
      padding: 1rem;
    }

    [hidden] {
      display: none !important;
    }

    button {
      font: inherit;
      margin: 0.25rem;
      padding: 0.5rem 0.75rem;
      border-radius: 6px;
      border: 1px solid #8b8b8b;
      background: #e8def8;
      cursor: pointer;
    }

    button:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }

    #meter {
      width: 100%;
      height: 1rem;
      margin: 0.75rem 0;
      border-radius: 999px;
      background: #e0e0e0;
      box-shadow: inset 0 1px 2px rgb(0 0 0 / 0.25);
    }

    #meter[aria-disabled='true'] {
      background: #d8d8d8;
    }
  `;

  /**
   * The current progress value.
   */
  @property({type: Number})
  value = 3;

  /**
   * The maximum progress value.
   */
  @property({type: Number})
  max = 10;

  /**
   * The increment applied by the arrow keys.
   */
  @property({type: Number})
  step = 1;

  /**
   * Disables the toggle and complete buttons.
   */
  @property({type: Boolean, reflect: true})
  disabled = false;

  /**
   * Whether the session panel is expanded.
   */
  @property({type: Boolean, reflect: true})
  expanded = false;

  override render() {
    return html`
      <button
        id="toggle"
        type="button"
        ?disabled=${this.disabled}
        aria-expanded=${this.expanded}
        @click=${this.#onToggle}>
        ${this.expanded ? 'Hide' : 'Show'} session panel
      </button>

      <section id="panel" ?hidden=${!this.expanded}>
        <h2 id="panel-title">Session progress</h2>
        <div
          id="meter"
          role="progressbar"
          aria-label="Session progress"
          aria-valuemin="0"
          aria-valuemax=${this.max}
          aria-valuenow=${this.value}
          aria-valuetext="${this.value} of ${this.max} sessions completed"
          aria-disabled=${this.disabled}
          tabindex=${this.disabled ? '-1' : '0'}
          @keydown=${this.#onMeterKeydown}></div>
        <button id="complete" type="button" ?disabled=${this.disabled} @click=${this.#onComplete}>
          Complete session
        </button>
      </section>

      <p id="status" role="status" aria-live="polite">
        ${this.value} of ${this.max} sessions completed
      </p>
    `;
  }

  #onToggle() {
    this.expanded = !this.expanded;
    if (this.expanded) {
      void this.updateComplete.then(() => {
        this.shadowRoot?.getElementById('complete')?.focus();
      });
    }
  }

  #onMeterKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.value = Math.min(this.value + this.step, this.max);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.value = Math.max(this.value - this.step, 0);
    }
  }

  #onComplete() {
    if (this.disabled) {
      return;
    }
    this.value = Math.min(this.value + 1, this.max);
    this.dispatchEvent(
      new CustomEvent('session-complete', {detail: this.value, bubbles: true, composed: true})
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'focus-stepper': FocusStepper;
  }
}
