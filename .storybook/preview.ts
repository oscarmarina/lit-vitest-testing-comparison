import type {Preview} from '@storybook/web-components';
import {setCustomElementsManifest} from '@storybook/web-components';
import customElements from '../custom-elements.json';
import './styles.css';

export const removeStatic = (customElements) => {
  customElements = structuredClone(customElements);
  for (const module of customElements.modules) {
    for (const declaration of module.declarations ?? []) {
      if (declaration.kind === 'class') {
        if (declaration.members !== undefined) {
          declaration.members = declaration.members.filter(
            (member) => member.kind !== 'field' || !member.static
          );
        }
      }
    }
  }
  return customElements;
};

// setCustomElementsManifest(removeStatic(customElements));
setCustomElementsManifest(customElements);

export default {
  parameters: {
    controls: {
      expandend: true,
      sort: 'alpha',
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
} satisfies Preview;
