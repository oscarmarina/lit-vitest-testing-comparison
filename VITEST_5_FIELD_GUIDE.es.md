# Vitest 5: Field Guide / Playbook

**Conocimiento empírico, no release-notes.** Este documento recoge los
comportamientos reales de Vitest 5 (y sus providers) descubiertos probando con
Web Components, Shadow DOM y Chromium. Es el complemento operativo de
[`VITEST_5_TECHNICAL_HANDBOOK.es.md`](./VITEST_5_TECHNICAL_HANDBOOK.es.md): allí
está "qué cambió en v5"; aquí está "qué hace de verdad y cómo no perder un día
en descubrirlo de nuevo".

**Política de evidencia:** cada entrada declara el *síntoma*, la *causa raíz*,
el *arreglo*, el *test que lo demuestra* y la *versión* donde fue verificado.
El conocimiento empírico caduca: ante cada bump de versión, re-ejecuta los
tests de evidencia antes de confiar en estas entradas.

**Versionado de verificación:** `5.0.0-rc.4`

---

## Cómo usar este documento

1. Cuando un test "raro" falle (o dé *Unhandled Rejection* sin test rojo),
   busca el síntoma en la [tabla de referencia rápida](#referencia-rápida).
2. Lee la entrada completa: el arreglo suele ser de 1 línea, pero el
   conocimiento está en el *porqué*.
3. Abre el test de evidencia enlazado: es la prueba viva, no una captura.
4. Si el caso no está, añádelo siguiendo la plantilla de
   [nuevas entradas](#cómo-añadir-una-entrada).

---

## Diferencia importante: identidad de nodo vs. coordenadas

Varias de las incidencias de abajo involucran dos problemas CDP distintos que
no deben confundirse.

### Resolver un nodo exacto

Cuando el test ya sabe qué elemento DOM quiere:

```text
Element
  ↓
backendNodeId
```

La meta es obtener la **identidad** de ese nodo exacto en CDP.

### Encontrar qué hay bajo un punto

Cuando CDP recibe coordenadas:

```text
x, y
  ↓
DOM.getNodeForLocation()
  ↓
nodo tras el hit-test
```

`DOM.getNodeForLocation()` responde **qué elemento gana el hit-test del
navegador en esas coordenadas**. No devuelve necesariamente el elemento DOM que
el test seleccionó originalmente.

Un overlay, un touch target, un elemento interno de Material u otro elemento
encima del objetivo puede ganar el hit-test.

Para interacción de puntero a nivel de protocolo, el patrón robusto verificado
por los tests de evidencia es:

```text
Element conocido
  ↓
backendNodeId exacto
  ↓
DOM.getContentQuads()
  ↓
geometría CDP
  ↓
punto de clic
  ↓
Input.dispatchMouseEvent
```

Esta distinción es especialmente importante cuando el objetivo vive dentro del
iframe de test de Vitest y de uno o más Shadow Roots.

---

## Incidencias

### F1. `clearMocks` ahora es `true` por defecto (rompe aserciones tardías)

**Síntoma.** El runner informa de `Unhandled Rejection` con
`AssertionError: expected "vi.fn()" to be called 1 times, but got 0 times`,
pero **todos los tests aparecen en verde**. El fallo proviene de una aserción
dentro de un `.catch()` / `.then()` que nadie esperó.

**Causa raíz.** Vitest 5 cambió el default de `clearMocks` de `false` a `true`
(`vitest/dist/chunks/defaults.js`: `clearMocks: true`). Cuando un test termina,
Vitest ejecuta `mockClear()` sobre todos los mocks. Si una aserción vive en un
callback asíncrono **no esperado** después de que el test ya terminó, el spy ya
está limpio cuando la aserción corre → 0 llamadas.

El fallo es por tanto una **carrera**: si el callback corre antes de la
limpieza, pasa; si corre después, falla.

La evidencia irrefutable es el "smoking gun" del spy: en el mismo callback, el
contador pasó de `spy=1` al entrar a `spy=0` tras un `await`. El evento SÍ se
disparó, pero el mock fue limpiado mientras el callback no esperado seguía
corriendo.

**Arreglo.** Espera la cadena completa de la promesa dentro del test:

```ts
// ❌ aserción en callback no esperado → posible Unhandled Rejection
el.generateRequest().catch(async () => {
  expect(spyEvent).toHaveBeenCalledTimes(1);
});
server.respond();

// ✅ el test espera el trabajo asíncrono real
const pending = el.generateRequest().catch(() => {
  expect(spyEvent).toHaveBeenCalledTimes(1);
});
server.respond();
await pending;
```

No "arregles" quitando un `await aTimeout(...)`: eso solo cambia el momento de
la carrera; no hace que el test sea dueño del trabajo asíncrono.

**Evidencia.** `packages/base/ajax-provider/test/ajax-provider.test.ts`
(bloques `ajaxerror` / `ajaxerrorend`) en el monorepo
`blockquote-web-components`. Confirmado con un override de config
(`clearMocks: false`) que hace desaparecer el síntoma.

**Verificado en.** `5.0.0-rc.1`.

---

### F2. `cdp()` se adjunta a la página orquestadora; llega al iframe del test vía su `frameId`

**Síntoma.** Llamas a `Accessibility.getFullAXTree` o `queryAXTree` vía `cdp()`
y no ves tu DOM: solo el `RootWebArea` de la página "Vitest Browser Runner" y un
nodo AX `Iframe` sin su contenido de test. `DOMSnapshot.captureSnapshot` tampoco
expone un *aria snapshot*.

**Causa raíz.** En el setup verificado de Vitest Browser Mode, la sesión CDP
devuelta por `cdp()` se adjunta a la página runner/orquestadora, que embebe el
iframe donde se ejecuta el test.

Los frames son **mismo-origen**, pero cada frame tiene su propio documento y su
propio árbol de accesibilidad. Una llamada de nivel documento **sin `frameId`
explícito** apunta por tanto al frame raíz asociado a la sesión CDP.

El iframe del test es visible como iframe desde la página raíz, pero su
contenido de accesibilidad pertenece al árbol AX propio del iframe.

**Arreglo.** Resuelve el `frameId` del frame del test y pásalo a
`Accessibility.getFullAXTree`:

```ts
const {frameTree} = await client.send('Page.getFrameTree');

// El test corre en el iframe de Vitest en este setup verificado.
const frameId = frameTree.childFrames[0].frame.id;

const {nodes} = await client.send(
  'Accessibility.getFullAXTree',
  {
    frameId,
  }
);
```

Esto devuelve el **árbol AX completo del iframe del test**, incluido su
`RootWebArea` y los componentes renderizados por el test.

`DOM.getNodeForLocation()` también puede informar del `frameId` del nodo que
gana el hit-test en un punto dado, útil al investigar problemas de coordenadas.

No trates `DOM.getNodeForLocation()` como una forma general de resolver un
elemento DOM conocido a su nodo CDP exacto. Hace hit-testing y puede devolver
un overlay, un touch target u otro elemento por encima del nodo seleccionado por
el test.

Para un **nodo concreto**, `Accessibility.getPartialAXTree` y
`Accessibility.queryAXTree` necesitan un ancla de nodo. Resuelve el elemento
real a su `backendNodeId` CDP y usa ese identificador como ancla:

```ts
const {nodes} = await client.send(
  'Accessibility.getPartialAXTree',
  {
    backendNodeId,
    fetchRelatives: true,
  }
);
```

Esto devuelve la información AX viva local alrededor de ese nodo, incluidos el
rol observado, el nombre computado, las propiedades y el valor actual.

**Evidencia.** `test/counter-element-aria-cdp.test.ts:198` (helper
`getFullAXTree`), `test/counter-element-aria-cdp.test.ts:919`
(test `getFullAXTree({frameId})`), `test/counter-element-aria-cdp.test.ts:270`
(helper `getCDPNodeForElement`), `test/counter-element-aria-cdp.test.ts:811`
(auditoría del progressbar).

**Verificado en.** `5.0.0-rc.1`, Chromium.

---

### F3. Esquema AX: el valor actual de un `progressbar` se expone en el campo `value` de nivel superior

**Síntoma.** Consultas el nodo AX de un `progressbar` con
`Accessibility.getPartialAXTree` y buscas `valuenow` en el array `properties`,
devolviendo `undefined`.

**Causa raíz.** En la respuesta AX de Chromium observada, el valor numérico
actual se expone en el campo `value` de nivel superior:

```ts
{
  type: 'number',
  value: 3,
}
```

Propiedades relacionadas como `valuemin`, `valuemax` y `focusable` aparecen en
el array `properties`.

**Arreglo.** Lee el valor actual de `node.value?.value`; usa `properties` para
las propiedades AX relacionadas:

```ts
const axValue = (node) =>
  node.value?.value;

const axProperty = (node, name) =>
  node.properties
    ?.find((property) => property.name === name)
    ?.value
    ?.value;
```

**Evidencia.** `test/counter-element-aria-cdp.test.ts:241` (helper `axValue`),
`:811` (auditoría con valor inicial 3 y valor 4 tras la interacción).

**Verificado en.** `5.0.0-rc.1`, Chromium.

---

### F4. El filtro `disabled` de `getByRole` no coincidió con `aria-disabled` en un `progressbar`

**Síntoma.** `getByRole('progressbar', {disabled: true})` no encuentra un
`progressbar` con `aria-disabled="true"`, aunque el atributo esté presente en el
DOM.

**Causa raíz.** En la configuración probada, la opción `disabled` no coincidió
con el estado `aria-disabled="true"` de este `progressbar`.

El comportamiento observado del filtro por rol, por tanto, no ofreció una forma
fiable de verificar el atributo ARIA en este caso.

**Arreglo.** Verifica el atributo directamente:

```ts
await expect
  .element(
    page.getByRole(
      'progressbar',
      {
        name: 'Session progress',
      }
    )
  )
  .toHaveAttribute(
    'aria-disabled',
    'true'
  );
```

**Evidencia.** `test/counter-element-aria-cdp.test.ts:521` (`filters by disabled
state`). Nota: el componente `src/FocusStepper.ts` desactiva
`lit-a11y/role-supports-aria-attr` porque usa `aria-disabled` en un `progressbar`
de forma deliberada.

**Verificado en.** `5.0.0-rc.1`.

---

### F5. `DOM.getNodeForLocation` hace hit-testing; puede no devolver el elemento que seleccionaste

**Síntoma.** Quieres resolver el `<button>` real que está dos Shadow Roots
adentro, por ejemplo:

```text
counter-element
  ↓
md-filled-button
  ↓
button
```

Usar `DOM.getNodeForLocation()` en el centro visual del botón puede devolver el
`<span>` del *touch target* de Material en lugar del `<button>` real.

Además, consultar desde un nodo host con `DOM.querySelector()` no desciende a su
Shadow Root en el camino CDP probado.

**Causa raíz.** `DOM.getNodeForLocation()` responde:

> ¿Qué elemento gana el hit-test en estas coordenadas?

No responde:

> ¿Qué elemento DOM seleccionó originalmente mi test?

Un overlay o un touch target pueden por tanto devolverse en lugar del botón
buscado.

Aparte, en el camino Chromium/CDP probado, consultar desde el host no descendió
a su árbol shadow. Consultar con el Shadow Root como nodo raíz sí lo hizo.

**Arreglo.** Cuando la meta sea inspeccionar un nodo interno del Shadow DOM a
través del dominio DOM de CDP, camina el documento aplanado y consulta desde el
Shadow Root:

```ts
const {nodes} = await client.send(
  'DOM.getFlattenedDocument',
  {
    depth: -1,
    pierce: true,
  }
);

const materialHost =
  nodes.find(
    (node) =>
      node.localName === 'md-filled-button'
  );

const shadowRoot =
  materialHost.shadowRoots[0];

const {nodeId} = await client.send(
  'DOM.querySelector',
  {
    nodeId: shadowRoot.nodeId,
    selector: 'button',
  }
);

const {node} = await client.send(
  'DOM.describeNode',
  {
    nodeId,
  }
);

expect(node.localName)
  .toBe('button');
```

**Evidencia.** `test/counter-element-aria-cdp.test.ts:941` (`pierces nested
shadow roots in the DOM domain snapshot`).

**Verificado en.** `5.0.0-rc.1`, Chromium.

---

### F6. `toHaveFocus` puede no reflejar el foco en un elemento interno del Shadow DOM

**Síntoma.** `expect.element(page.getByRole('button')).toHaveFocus()` puede
fallar cuando el nodo realmente enfocado está dentro de un Shadow Root.

**Causa raíz.** En la frontera del documento, `document.activeElement` puede ser
el host del custom element mientras el elemento realmente enfocado se expone a
través de:

```ts
shadowRoot.activeElement
```

El estado de foco depende por tanto de la frontera del árbol que se inspeccione.

**Arreglo.** Consulta el Shadow Root relevante directamente:

```ts
await userEvent.tab();

expect(
  el.shadowRoot?.activeElement?.id
).toBe('toggle');
```

**Evidencia.** `test/counter-element-aria-cdp.test.ts:689` (activación con
Space/Enter y gestión de foco),
`test/counter-element-aria-cdp.test.ts:723` (flechas sobre el progressbar).

**Verificado en.** `5.0.0-rc.1`.

---

### F7. `Input.dispatchKeyEvent` desde la sesión CDP raíz no llegó al iframe del test con foco

**Síntoma.** Usas `Input.dispatchKeyEvent` vía la sesión CDP raíz para simular
el teclado y no pasa nada: el elemento activo esperado dentro del iframe del
test no recibe la tecla.

**Causa raíz.** En el setup verificado, la sesión CDP se adjunta a la página
runner/orquestadora de Vitest. La entrada de teclado a nivel de protocolo
inyectada a través de esa sesión no apuntó al elemento con foco dentro del
iframe del test.

**Arreglo.** Para interacción de teclado normal en Browser Mode, usa:

```ts
await userEvent.keyboard(' ');
await userEvent.tab();
```

Esto ejercita el test a través de la capa de interacción del browser de Vitest
y, en el setup verificado, apunta al documento de test correcto.

No generalices esta observación a cualquier configuración de destino/sesión
CDP: la evidencia solo establece el comportamiento de la sesión CDP raíz usada
aquí.

**Evidencia.** `test/counter-element-aria-cdp.test.ts:689`, `:723`
(teclado vía `userEvent`).

**Verificado en.** `5.0.0-rc.1`, Chromium.

---

### F8. `Input.dispatchMouseEvent` puede hacer clic dentro del iframe del test cuando las coordenadas vienen de la geometría CDP

**Síntoma.** Una secuencia de mouse a nivel de protocolo parece no hacer nada
aunque el botón objetivo exista y pueda encontrarse con los locators de Vitest.

El objetivo puede estar dentro del iframe de test de Vitest y de uno o más
Shadow Roots.

**Causa raíz.** El problema no es necesariamente `Input.dispatchMouseEvent` en
sí; puede ser el sistema de coordenadas usado para `x` e `y`.

Las coordenadas obtenidas de:

```ts
element.getBoundingClientRect()
```

pertenecen al documento del elemento. Combinar manualmente esas coordenadas con
offsets del iframe puede mezclar espacios de coordenadas y producir un punto que
parece válido pero falla el objetivo real.

`DOM.getNodeForLocation()` tampoco es un reemplazo para resolver el elemento
exacto: hace hit-testing y puede devolver un overlay o un touch target por
encima del nodo seleccionado.

**Arreglo.** Resuelve el elemento exacto a su `backendNodeId` CDP, espera al
siguiente animation frame (un `requestAnimationFrame` — evita quads vacíos
cuando `browser.trace: 'on'` está activo), pide a CDP la geometría de ese nodo
con `DOM.getContentQuads()`, traduce las coordenadas del viewport del iframe al
viewport de la página raíz, y dispara los eventos de mouse en ese punto:

```ts
async function getCDPClickPointForElement(
  element: Element
): Promise<{x: number; y: number}> {
  await client.send('DOM.enable');

  const {backendNodeId, frameId} =
    await getCDPNodeForElement(element);

  // trace: 'on' puede invalidar el layout tras eliminar el marcador.
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => resolve())
  );

  const {quads} = await client.send(
    'DOM.getContentQuads',
    {backendNodeId}
  );

  if (!quads?.length) {
    throw new Error(
      `DOM.getContentQuads returned no geometry for backendNodeId ${backendNodeId}`
    );
  }

  const quad = quads[0] as number[];

  if (quad.length !== 8) {
    throw new Error(
      `Unexpected quad returned by DOM.getContentQuads: ${JSON.stringify(quad)}`
    );
  }

  // [x1, y1, x2, y2, x3, y3, x4, y4]
  let x = (quad[0] + quad[2] + quad[4] + quad[6]) / 4;
  let y = (quad[1] + quad[3] + quad[5] + quad[7]) / 4;

  // Traduce del iframe a coordenadas de página raíz
  const {frameTree} = await client.send('Page.getFrameTree');

  if (frameTree.frame.id !== frameId) {
    const {node} = await client.send(
      'DOM.getFrameOwner',
      {frameId}
    );

    if (node?.backendNodeId) {
      const {model} = await client.send(
        'DOM.getBoxModel',
        {backendNodeId: node.backendNodeId}
      );

      x += model.content[0];
      y += model.content[1];
    }
  }

  return {x: Math.round(x), y: Math.round(y)};
}
```

Después dispara la secuencia de puntero completa:

```ts
const {x, y} =
  await getCDPClickPointForElement(button);

await client.send(
  'Input.dispatchMouseEvent',
  {
    type: 'mouseMoved',
    x,
    y,
  }
);

await client.send(
  'Input.dispatchMouseEvent',
  {
    type: 'mousePressed',
    x,
    y,
    button: 'left',
    buttons: 1,
    clickCount: 1,
  }
);

await client.send(
  'Input.dispatchMouseEvent',
  {
    type: 'mouseReleased',
    x,
    y,
    button: 'left',
    buttons: 0,
    clickCount: 1,
  }
);
```

El test de evidencia confirmó la secuencia completa de eventos del navegador:

```text
pointerdown
mousedown
pointerup
mouseup
click
```

y confirmó que el evento llegó al custom element y cambió el estado del
componente:

```text
counter: 5
  ↓
counter: 6
```

El camino de interacción verificado es por tanto:

```text
locator de Vitest
  ↓
elemento DOM real
  ↓
backendNodeId exacto
  ↓
DOM.getContentQuads()
  ↓
punto central en geometría CDP
  ↓
Input.dispatchMouseEvent
  ↓
pointerdown
mousedown
pointerup
mouseup
click
  ↓
actualización del estado del componente
```

**Evidencia.** `test/counter-element-aria-cdp.test.ts:26` (helper
`getCDPClickPointForElement`),
`test/counter-element-aria-cdp.test.ts:981` (`drives a real pointer click with
raw Input.dispatchMouseEvent`).

**Verificado en.** `5.0.0-rc.1`, Chromium.

---

### F9. `Emulation.setEmulatedMedia` afectó a `matchMedia` en tiempo real

**Síntoma/patrón.** Quieres probar `@media (prefers-reduced-motion)` o
`forced-colors` sin reconfigurar el navegador.

**Arreglo/patrón.** En la sesión Chromium probada, `Emulation.setEmulatedMedia`
cambió el estado de medios observado por `matchMedia()` dentro del iframe del
test:

```ts
await client.send(
  'Emulation.setEmulatedMedia',
  {
    media: '',
    features: [
      {
        name: 'prefers-reduced-motion',
        value: 'reduce',
      },
      {
        name: 'forced-colors',
        value: 'active',
      },
    ],
  }
);

expect(
  matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches
).toBe(true);

// Restaura el estado por defecto.
await client.send(
  'Emulation.setEmulatedMedia',
  {
    media: '',
    features: [],
  }
);
```

**Evidencia.** `test/counter-element-aria-cdp.test.ts:1058` (`emulates
prefers-reduced-motion and forced-colors at the protocol level`).

**Verificado en.** `5.0.0-rc.1`, Chromium.

---

### F10. El `getByText` exacto no resolvió texto con `slot` en la estructura probada

**Síntoma.** `getByText('light-dom')` no encuentra texto montado como contenido
Light DOM para un slot del componente, aunque el texto esté visible.

**Causa raíz.** En la estructura probada, `getByText()` exacto no resolvió el
texto con `slot`, mientras que el árbol ARIA programático generado sí incluyó el
texto compuesto.

La evidencia establece el comportamiento observado para esta estructura; no debe
tratarse como una regla general para cualquier combinación de slot o consulta de
texto.

**Arreglo.** Cuando la meta sea verificar contenido accesible compuesto,
inspecciona el árbol ARIA programático:

```ts
const tree =
  utils.aria.renderAriaTree(
    utils.aria.generateAriaTree(el)
  );

expect(tree)
  .toContain('- text: light-dom');
```

**Evidencia.** `test/counter-element-aria-cdp.test.ts:421` (`prunes aria-hidden
nodes but keeps composed slotted light DOM`).

**Verificado en.** `5.0.0-rc.1`.

---

### F11. Patrón positivo: los locators ARIA perforan el Shadow DOM anidado

**Síntoma/patrón.** No es una incidencia — es el atajo que evita caminar
manualmente los Shadow Roots en la mayoría de las verificaciones a nivel de
browser.

En el setup probado, `getByRole` y los locators ARIA relacionados pueden
encontrar elementos dentro de Shadow DOM anidado sin configuración adicional:

```ts
const button =
  page.getByRole(
    'button',
    {
      name: 'Counter: 5',
    }
  );

await expect
  .element(button)
  .toBeEnabled();

await expect
  .element(button)
  .toHaveAccessibleName(
    'Counter: 5'
  );
```

Esto no implica que el dominio DOM de CDP siga las mismas reglas de
recorrido. Los locators ARIA y las consultas DOM de CDP son mecanismos
separados.

`page.elementLocator(el)` junto con `toMatchAriaInlineSnapshot` también puede
comparar el árbol accesible del componente contra un snapshot literal, incluido
el contenido compuesto probado:

```yaml
- button "Hide session panel" [expanded]
- heading "Session progress" [level=2]
- progressbar "Session progress"
- button "Complete session"
- status
```

**Evidencia.** `test/counter-element-aria-cdp.test.ts:393` (bloque de locators),
`test/counter-element-aria-cdp.test.ts:1134` (`toMatchAriaInlineSnapshot`),
`test/counter-element-aria-cdp.test.ts:1152` (árbol programático).

**Verificado en.** `5.0.0-rc.1`.

---

### F12. La grabación de traces puede hacer que la primera consulta de geometría CDP no devuelva quads

**Síntoma.** Con `browser.trace: 'on'`, `DOM.getContentQuads()` puede devolver
un array `quads` vacío para un elemento recién resuelto. El mismo archivo
completo pasa con `--browser.trace=off`, mientras el fallo con trace informa de
un `backendNodeId` válido pero sin geometría.

**Límite de causa observado.** En `5.0.0-rc.4`, el fallo apareció después de
que tests anteriores generasen actividad de trace. No estaba ligado a un único
comando CDP previo, y mantener vivo el `RemoteObject` original no bastó por sí
solo. La evidencia establece una interacción transitoria entre trace y
geometría; no establece qué etapa de Vitest, Playwright o Chromium la causa.

**Arreglo.** Mantén vivo el `RemoteObject` CDP mientras solicitas su geometría.
Si el resultado no tiene quads, espera al siguiente frame de animación y vuelve
a resolver el elemento DOM a un nuevo objeto CDP antes de reintentar. Acota la
operación y falla si ningún intento produce geometría de layout:

```ts
for (let attempt = 0; attempt < 3; attempt += 1) {
  const geometry = await resolveAndReadQuads(element);

  if (geometry.quads.length) {
    return geometry;
  }

  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => resolve())
  );
}

throw new Error(
  'DOM.getContentQuads returned no geometry after 3 element resolutions'
);
```

No reintentes indefinidamente el mismo identificador separado. Cada intento
debe restablecer la correlación elemento-CDP, consumirla antes de liberar el
objeto remoto y tener un límite fijo.

**Evidencia.** `test/counter-element-aria-cdp.test.ts` (helpers
`withCDPNodeForElement` y `getCDPClickPointForElement`; test `drives a real
pointer click with raw Input.dispatchMouseEvent`). Antes del arreglo, el estrés
con traces produjo 4 fallos de geometría en 25 repeticiones y falló el archivo
completo; con trace desactivado, los 26 tests pasaron. Después del arreglo, el
proyecto completo con trace pasó sus 37 tests.

**Verificado en.** `5.0.0-rc.4`, Chromium/Playwright 1.62.

---

## Referencia rápida

| Síntoma | Entrada |
| --- | --- |
| Tests verdes pero `Unhandled Rejection` con spy a 0 llamadas | [F1](#f1-clearmocks-ahora-es-true-por-defecto-rompe-aserciones-tardías) |
| `getFullAXTree` no ve tu DOM / solo ve el iframe del runner | [F2](#f2-cdp-se-adjunta-a-la-página-orquestadora-llega-al-iframe-del-test-vía-su-frameid) |
| El valor actual de un `progressbar` devuelve `undefined` por CDP | [F3](#f3-esquema-ax-el-valor-actual-de-un-progressbar-se-expone-en-el-campo-value-de-nivel-superior) |
| `getByRole(..., {disabled: true})` no encuentra `aria-disabled` | [F4](#f4-el-filtro-disabled-de-getbyrole-no-coincidió-con-aria-disabled-en-un-progressbar) |
| `DOM.getNodeForLocation` devuelve un overlay/touch target en lugar del elemento seleccionado | [F5](#f5-domgetnodeforlocation-hace-hit-testing-puede-no-devolver-el-elemento-que-seleccionaste) |
| `toHaveFocus` no refleja el foco dentro de un Shadow Root | [F6](#f6-tohavefocus-puede-no-reflejar-el-foco-en-un-elemento-interno-del-shadow-dom) |
| `Input.dispatchKeyEvent` desde la sesión CDP raíz no hace nada en el iframe del test | [F7](#f7-inputdispatchkeyevent-desde-la-sesión-cdp-raíz-no-llegó-al-iframe-del-test-con-foco) |
| Un clic CDP crudo falla en un elemento dentro del iframe del test / Shadow DOM | [F8](#f8-inputdispatchmouseevent-puede-hacer-clic-dentro-del-iframe-del-test-cuando-las-coordenadas-vienen-de-la-geometría-cdp) |
| Probar `prefers-reduced-motion` / `forced-colors` | [F9](#f9-emulationsetemulatedmedia-afectó-a-matchmedia-en-tiempo-real) |
| El `getByText` exacto no encuentra texto con `slot` | [F10](#f10-el-getbytext-exacto-no-resolvió-texto-con-slot-en-la-estructura-probada) |
| Buscar/en-snapshot elementos dentro del Shadow DOM anidado | [F11](#f11-patrón-positivo-los-locators-aria-perforan-el-shadow-dom-anidado) |
| `DOM.getContentQuads` no devuelve geometría intermitentemente con traces activos | [F12](#f12-la-grabación-de-traces-puede-hacer-que-la-primera-consulta-de-geometría-cdp-no-devuelva-quads) |

---

## Método de depuración

El meta-conocimiento que hizo resolubles F1-F11. Orden de ataque ante un fallo
"raro" en Vitest 5 Browser Mode:

1. **Aislar.** Corre un solo archivo con un solo browser:

   ```bash
   npx vitest run test/mi-suite.test.ts
   ```

   Esto reduce la contaminación entre tests.

2. **Bisecar.** Usa:

   ```bash
   npx vitest run -t "nombre del test"
   ```

   Si el fallo sobrevive en aislamiento, el problema es probablemente local al
   test o componente. Si solo aparece en la suite completa, investiga estado
   compartido, limpieza de ciclo de vida, mocks globales o un fake server
   compartido.

3. **Instrumentar in situ.** Pon `console.log` dentro del callback sospechoso y
   registra el orden real de los eventos y las transiciones de estado.

   Ejemplo de F1: imprime `spy.mock.calls.length` al entrar al callback y de
   nuevo tras un `await`.

4. **Confirmar con un override de config.** Para probar una hipótesis sobre un
   default, inviértela temporalmente:

   ```ts
   clearMocks: false
   ```

   Si el síntoma cambia exactamente como se predijo, la hipótesis gana evidencia
   fuerte.

5. **Reducir a un repro mínimo.** Una vez entendido el mecanismo, reprodúcelo
   con el test más pequeño posible. Si el repro mínimo pasa, compara su contexto
   de ejecución con la suite que falla.

6. **Separa la identidad del nodo de la geometría.** Al depurar interacción CDP,
   primero pregúntate:

   ```text
   ¿Tengo el nodo exacto?
   ```

   y después, por separado:

   ```text
   ¿Tengo coordenadas en el sistema de coordenadas que espera este comando CDP?
   ```

   No uses un resultado de hit-test como prueba de que resolviste el elemento
   original.

Regla de oro: **un `Unhandled Rejection` significa que algún fallo asíncrono
escapó del flujo de control normal del test hasta que se demuestre lo
contrario.** Primero verifica si la cadena de promesas está correctamente
esperada antes de culpar al componente.

---

## Cómo añadir una entrada

Sigue la plantilla de las entradas F1-F12:

1. **Síntoma** observable — incluyendo dónde aparece: runner, matcher, CDP,
   browser o componente.
2. **Causa raíz** — explica el mecanismo observado, no solo la solución.
3. **Arreglo / patrón** — con el ejemplo de código útil más pequeño.
4. **Evidencia** — ruta del test real más número de línea o nombre de
   `describe` / test estable.
5. **Verificado en** — versión de Vitest más provider/browser.

Al escribir la causa raíz, distingue claramente entre:

```text
Observado:
lo que el test de evidencia prueba directamente

Inferido:
el mecanismo que mejor explica la observación

General:
comportamiento conocido que aplica fuera de esta configuración exacta probada
```

No promuevas en silencio una observación empírica a regla general del protocolo.

Condiciones para incluirla:

- fue un comportamiento **inesperado**;
- costó más de 15 minutos entenderlo;
- hay un test de evidencia real que demuestra el comportamiento;
- la entrada registra la versión/provider/browser exactos donde se observó.

Si el comportamiento ya está documentado claramente como un contrato de API
intencional, no pertenece aquí como incidencia; enlázalo al handbook técnico.
