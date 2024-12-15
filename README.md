# Testing Lit with Vitest Browser and Playwright

## Introduction

This guide outlines the process of migrating from using Web Test Runner to Vitest Browser for testing web components created with Lit. For more details on browser mode, visit the [Vitest guide](https://vitest.dev/guide/browser.html#browser-mode-experimental).

This change stems from a desire to explore more popular and widely adopted options in the open-source world, such as Vite and Vitest.

It's interesting to see how Vitest Browser draws inspiration from many other tools, including Web Test Runner itself.

- [Vitest Browser - Discussions](https://github.com/vitest-dev/vitest/discussions/5828)
- [Vitest Browser - Context module](https://github.com/vitest-dev/vitest/pull/5097)

### Demo

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/oscarmarina/lit-vitest-testing-comparison/tree/feature/typescript)

<hr>

#### Using Chai A11y aXe and rollup-plugin-externalize-source-dependencies

The [Chai A11y aXe](https://open-wc.org/docs/testing/chai-a11y-axe/#testing-chai-a11y-axe) testing library can be used with Vitest.

```js
test('a11y', async () => {
  await assert.isAccessible(el);
});
```

> However, you'll need to add the following plugin to your Vite configuration:

- Configured via `vite.config.js`
- [rollup-plugin-externalize-source-dependencies](https://github.com/oscarmarina/rollup-plugin-externalize-source-dependencies)

```js
import { defineConfig } from 'vite';
import externalizeSourceDependencies from '@blockquote/rollup-plugin-externalize-source-dependencies';

export default {
  plugins: [
    externalizeSourceDependencies([
      /* @web/test-runner-commands needs to establish a web-socket
       * connection. It expects a file to be served from the
       * @web/dev-server. So it should be ignored by Vite */
      '/__web-dev-server__web-socket.js',
    ]),
  ],
};
```

#### Using Vitest Snapshots with Semantic-DOM-Diff

Vitest's snapshot feature combines very well with `getDiffableHTML` from `@open-wc/semantic-dom-diff`, providing a powerful way to test DOM structures meaningfully.

```js
test('LIGHT DOM - Structure test', () => {
  expect(htmlStructureSnapshot(el, ['id'])).toMatchSnapshot('LIGHT DOM');
});
```

For more details, refer to the [snapshots - semantic-dom-diff](https://open-wc.org/docs/testing/semantic-dom-diff/) documentation.

<hr>

**Scaffold generated using**:

> [npm init @blockquote/wc](https://github.com/oscarmarina/create-wc)
