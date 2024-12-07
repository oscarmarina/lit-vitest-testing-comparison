import type {Meta, StoryObj} from '@storybook/web-components';
import type {CounterElement} from '../dist/src/CounterElement.js';
import {getWcStorybookHelpers} from 'wc-storybook-helpers';
import {withActions} from '@storybook/addon-actions/decorator';
import {html} from 'lit';

import '../dist/src/define/counter-element.js';

const {events, args, argTypes, template} = getWcStorybookHelpers('counter-element');
console.log('args', events, args, argTypes, template);
export default {
  title: 'Components/counter-element',
  component: 'counter-element',
  tags: ['autodocs'],
  args,
  argTypes,
  parameters: {
    actions: {
      handles: events,
    },
  },
  decorators: [withActions],
} satisfies Meta<CounterElement>;

type Story = StoryObj<CounterElement & typeof args>;

export const Default: Story = {
  render: (args) => html`
    ${template(args)}
  `,
  args: {
    'default-slot': 'some light-dom',
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
