import type {Meta, StoryObj} from '@storybook/web-components';
import type {CounterElement} from '../dist/src/CounterElement.js';
import {withActions} from '@storybook/addon-actions/decorator';
import {html} from 'lit';
import '../dist/src/define/counter-element.js';

export default {
  title: 'Components/counter-element',
  component: 'counter-element',
  tags: ['autodocs'],
  args: {},
  render: ({heading, counter}) => html`
    <counter-element .counter="${counter}" .heading="${heading}">some light-dom</counter-element>
  `,
  argTypes: {
    counter: {control: 'number'},
    heading: {control: 'text'},
  },
  parameters: {
    actions: {
      handles: ['counterchange'],
    },
  },
  decorators: [withActions],
} satisfies Meta<CounterElement>;

/**
 * create Story type that will provide autocomplete and docs for `args`,
 * but also allow for namespaced args like CSS Shadow Parts and Slots
 */
type Story = StoryObj<CounterElement>;

export const Default: Story = {
  args: {
    heading: '👋',
    counter: 5,
  },
  play: async () => {
    const submitButton = document.querySelector('counter-element');
    const rootNode = document.querySelector('#storybook-root');

    submitButton?.addEventListener('counterchange', (ev: Event) => {
      const customEvent = ev as CustomEvent;
      const newEvent = new CustomEvent('counterchange', {
        detail: customEvent.detail,
      });
      rootNode?.dispatchEvent(newEvent);
    });
  },
};
