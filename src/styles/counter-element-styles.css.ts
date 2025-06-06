import {css} from 'lit';

export const styles = css`
  :host {
    display: block;
    box-sizing: border-box;
    background-color: #fef7ff;
    padding: 1rem;
  }

  :host([hidden]),
  [hidden] {
    display: none !important;
  }

  *,
  *::before,
  *::after {
    box-sizing: inherit;
  }

  h1 {
    font-size: 1.5rem;
    margin: 0;
  }

  md-filled-button {
    display: inline-flex;
    margin: 0.5rem 0;
    font: inherit;
  }
`;
