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

**Versionado de verificación:** `5.0.0-rc.1`, Chromium/Playwright 1.62.

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

## Incidencias

### F1. `clearMocks` ahora es `true` por defecto (rompe aserciones tardías)

**Síntoma.** El runner informa de `Unhandled Rejection` con
`AssertionError: expected "vi.fn()" to be called 1 times, but got 0 times`,
pero **todos los tests aparecen en verde**. El fallo proviene de una aserción
dentro de un `.catch()` / `.then()` que nadie esperó.

**Causa raíz.** Vitest 5 cambió el default de `clearMocks` de `false` a `true`
(`vitest/dist/chunks/defaults.js`: `clearMocks: true`). Cuando un test termina,
Vitest ejecuta `mockClear()` sobre todos los mocks. Si una aserción vive en un
callback asíncrono **no esperado** (el test ya terminó), el spy ya está limpio
cuando la aserción corre → 0 llamadas. Además, el fallo es una **carrera**: si
el callback se ejecuta antes de la limpieza (microtask), pasa; si después,
falla. Por eso parece intermitente.

La evidencia irrefutable es el "smoking gun" del spy: en el mismo callback, el
contador pasa de `spy=1` (justo al entrar) a `spy=0` (después de un `await`):
el evento SÍ se disparó, pero el mock fue limpiado a mitad de vuelo.

**Arreglo.** Espera la cadena completa de la promesa dentro del test:

```ts
// ❌ aserción en callback no esperado → Unhandled Rejection
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

No "arregles" quitando el `await aTimeout(...)`: eso solo cambia la carrera,
no la elimina. Si el proveedor pasara a emitir eventos en un timer en vez de
sincrónicamente, el test volvería a fallar.

**Evidencia.** `packages/base/ajax-provider/test/ajax-provider.test.ts`
(bloques `ajaxerror` / `ajaxerrorend`) en el monorepo
`blockquote-web-components`. Confirmado con un override de config
(`clearMocks: false`) que hace desaparecer el error.

**Verificado en.** `5.0.0-rc.1`.

---

### F2. `cdp()` se adjunta a la página orquestadora, no al iframe del test

**Síntoma.** Llamas a `Accessibility.getFullAXTree` o `queryAXTree` vía `cdp()`
y no ves tu DOM: solo el `RootWebArea` de la página "Vitest Browser Runner" y
un nodo AX `Iframe` **sin hijos** (`childIds: []`). `DOMSnapshot.captureSnapshot`
tampoco expone un *aria snapshot*.

**Causa raíz.** La sesión CDP de `cdp()` (de `vitest/browser`) se adjunta a la
página **orquestadora**, que embebe el iframe donde corre tu test. El árbol AX
del iframe es un árbol separado por frame; los métodos de nivel documento no lo
atraviesan.

**Arreglo.** Audita el árbol AX del elemento en concreto con el truco de "nodo
bajo el cursor":

```ts
const {backendNodeId} = await client.send('DOM.getNodeForLocation', {
  x: Math.round(rect.x + rect.width / 2),
  y: Math.round(rect.y + rect.height / 2),
});
const {nodes} = await client.send('Accessibility.getPartialAXTree', {
  backendNodeId,
  fetchRelatives: true,
});
```

Esto devuelve el **nodo AX vivo** del elemento (rol, nombre computado,
propiedades y valor actual) — la caché AX real del navegador, independiente de
tus lecturas del DOM. Helper completo en `test/counter-element-aria-cdp.test.ts`
(`axNodeAtPoint`).

**Evidencia.** `test/counter-element-aria-cdp.test.ts:69` (helper),
`test/counter-element-aria-cdp.test.ts:358` (test `getFullAXTree`),
`test/counter-element-aria-cdp.test.ts:312` (auditoría del progressbar).

**Verificado en.** `5.0.0-rc.1`, Chromium.

---

### F3. Esquema AX: el valor de un `progressbar` no está en `properties`

**Síntoma.** Consultas el nodo AX de un `progressbar` con
`Accessibility.getPartialAXTree` y buscas `valuenow` en el array `properties`
devolviendo `undefined`.

**Causa raíz.** Para widgets de valor, el **valor actual vive en el campo
`value` de nivel superior** del nodo AX (`{type: 'number', value: 3}`). En
`properties` solo están `valuemin`, `valuemax`, `valuetext` y `focusable` (este
último solo aparece si el elemento tiene `tabindex`).

**Arreglo.** Lee `node.value?.value` para el valor actual; deja
`properties` para los extremos y atributos:

```ts
const axValue = (node) => node.value?.value;   // valuenow
const axProperty = (node, name) =>
  node.properties?.find((p) => p.name === name)?.value?.value; // valuemin/max/focusable
```

**Evidencia.** `test/counter-element-aria-cdp.test.ts:93` (helper `axValue`),
`:312` (auditoría con valor inicial 3 y tras interacción 4).

**Verificado en.** `5.0.0-rc.1`, Chromium.

---

### F4. El filtro `disabled` de `getByRole` ignora `aria-disabled`

**Síntoma.** `getByRole('progressbar', {disabled: true})` no encuentra un
`progressbar` con `aria-disabled="true"`, aunque el atributo esté en el DOM.

**Causa raíz.** El filtro `disabled` del rol-engine de Ivya coincide con el
atributo **nativo** `disabled` (botones), pero **no** con `aria-disabled` en
widgets no-botón. Son estados accesibles distintos: el filtro de rol opera sobre
el estado de widget real, no sobre el atributo ARIA de marcado.

**Arreglo.** Para widgets usa el atributo directamente:

```ts
// ❌ getByRole('progressbar', {name: 'Session progress', disabled: true})
await expect
  .element(page.getByRole('progressbar', {name: 'Session progress'}))
  .toHaveAttribute('aria-disabled', 'true');
```

**Evidencia.** `test/counter-element-aria-cdp.test.ts:167` (`filters by
disabled state`). Nota: el componente `src/FocusStepper.ts` desactiva
`lit-a11y/role-supports-aria-attr` porque usa `aria-disabled` en un `progressbar`
de forma deliberada.

**Verificado en.** `5.0.0-rc.1`.

---

### F5. `DOM.querySelector` solo perfora Shadow DOM con la raíz = Shadow Root

**Síntoma.** Quieres resolver el `<button>` real que está dos Shadow Roots
adentro (p. ej. `counter-element` → `md-filled-button` → `<button>`). Dos
caminos fallan: `DOM.getNodeForLocation` en el centro del botón devuelve el
`<span>` del *touch target* de Material, y `DOM.querySelector({nodeId: host})`
con selector `button` no baja por el Shadow Root del host.

**Causa raíz.** `getNodeForLocation` resuelve el elemento de mayor z-index bajo
el cursor (los botones de Material superponen un *touch target*). Y
`DOM.querySelector` de CDP solo atraviesa el Shadow DOM cuando el `nodeId` raíz
**es** el propio Shadow Root, no cuando es el host.

**Arreglo.** Camina el árbol plano y consulta desde el Shadow Root:

```ts
const {nodes} = await client.send('DOM.getFlattenedDocument', {depth: -1, pierce: true});
const materialHost = nodes.find((n) => n.localName === 'md-filled-button');
const shadowRoot = materialHost.shadowRoots[0];

const {nodeId} = await client.send('DOM.querySelector', {
  nodeId: shadowRoot.nodeId,   // ← la raíz debe ser el Shadow Root
  selector: 'button',
});
const {node} = await client.send('DOM.describeNode', {nodeId});
expect(node.localName).toBe('button');
```

**Evidencia.** `test/counter-element-aria-cdp.test.ts:369` (`pierces nested
shadow roots in the DOM domain snapshot`).

**Verificado en.** `5.0.0-rc.1`, Chromium.

---

### F6. `toHaveFocus` es poco fiable para elementos internos del Shadow DOM

**Síntoma.** `expect.element(page.getByRole('button')).toHaveFocus()` falla (o
pasa de forma engañosa) para un botón dentro del Shadow Root, aunque el foco
real esté en él.

**Causa raíz.** `document.activeElement` (y el matcher que lo usa) apunta al
**host** del custom element, no al elemento interior del Shadow Root. La
retención de foco a través de la frontera del shadow no se refleja en
`document.activeElement`.

**Arreglo.** Consulta el `activeElement` del Shadow Root directamente:

```ts
await userEvent.tab();
expect(el.shadowRoot?.activeElement?.id).toBe('toggle');
```

**Evidencia.** `test/counter-element-aria-cdp.test.ts:250` (activación con
Space/Enter y gestión de foco),
`test/counter-element-aria-cdp.test.ts:271` (flechas sobre el progressbar).

**Verificado en.** `5.0.0-rc.1`.

---

### F7. `Input.dispatchKeyEvent` no llega al iframe del test

**Síntoma.** Usas `Input.dispatchKeyEvent` vía CDP para simular teclado y no
pasa nada: el `activeElement` de tu página no recibe la tecla.

**Causa raíz.** La sesión CDP apunta a la página orquestadora (F2). Los eventos
de teclado a nivel de protocolo se dirigen al foco de esa página superior, no al
iframe del test.

**Arreglo.** Para teclado usa `userEvent.keyboard(...)` / `userEvent.tab()`
de `vitest/browser`, que inyecta los eventos dentro del iframe correcto.
Reserva CDP `Input.*` para **puntero**, que sí funciona (F8).

**Evidencia.** `test/counter-element-aria-cdp.test.ts:250`, `:271`
(teclado vía `userEvent`).

**Verificado en.** `5.0.0-rc.1`.

---

### F8. `Input.dispatchMouseEvent` produce clicks reales que sí llegan

**Síntoma/patrón.** A diferencia del teclado, la secuencia de puntero a nivel de
protocolo **funciona** sobre el contenido del iframe y dispara los handlers
reales.

**Arreglo/patrón.**

```ts
await client.send('Input.dispatchMouseEvent', {type: 'mouseMoved', x, y});
await client.send('Input.dispatchMouseEvent', {type: 'mousePressed', x, y, button: 'left', clickCount: 1});
await client.send('Input.dispatchMouseEvent', {type: 'mouseReleased', x, y, button: 'left', clickCount: 1});
```

Útil cuando necesitas el clic "de sistema" (p. ej. para verificar que el árbol
AX del navegador refleja el nuevo estado, independiente del matcher).

**Evidencia.** `test/counter-element-aria-cdp.test.ts:398` (`drives a real
pointer click with raw Input.dispatchMouseEvent`).

**Verificado en.** `5.0.0-rc.1`, Chromium.

---

### F9. `Emulation.setEmulatedMedia` afecta a `matchMedia` en tiempo real

**Síntoma/patrón.** Quieres probar `@media (prefers-reduced-motion)` o
`forced-colors` sin reconfigurar el navegador.

**Arreglo/patrón.** `Emulation.setEmulatedMedia` cambia `matchMedia(...).matches`
en vivo dentro del iframe:

```ts
await client.send('Emulation.setEmulatedMedia', {
  media: '',
  features: [
    {name: 'prefers-reduced-motion', value: 'reduce'},
    {name: 'forced-colors', value: 'active'},
  ],
});
expect(matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(true);
// ... finalmente restaura
await client.send('Emulation.setEmulatedMedia', {media: '', features: []});
```

**Evidencia.** `test/counter-element-aria-cdp.test.ts:430` (`emulates
prefers-reduced-motion and forced-colors at the protocol level`).

**Verificado en.** `5.0.0-rc.1`, Chromium.

---

### F10. `getByText` exacto falla con texto con `slot`

**Síntoma.** `getByText('light-dom')` no encuentra texto que montaste como
Light DOM `slot` dentro del componente, aunque el texto esté visible.

**Causa raíz.** El texto con `slot` se compone en el árbol accesible, pero la
coincidencia *exacta* de texto no lo alcanza igual que una búsqueda por rol. La
serialización programática del árbol sí lo incluye.

**Arreglo.** Para verificar contenido compuesto, usa el árbol ARIA
programático:

```ts
const tree = utils.aria.renderAriaTree(utils.aria.generateAriaTree(el));
expect(tree).toContain('- text: light-dom');
```

**Evidencia.** `test/counter-element-aria-cdp.test.ts:120` (`prunes aria-hidden
nodes but keeps composed slotted light DOM`).

**Verificado en.** `5.0.0-rc.1`.

---

### F11. Patrón positivo: los locators ARIA perforan el Shadow DOM anidado

**Síntoma/patrón.** No es una incidencia, es el atajo que evita todo lo
anterior: `getByRole` / `getByLabelText` ven a través de los Shadow Roots **sin
configuración extra**:

```ts
const button = page.getByRole('button', {name: 'Counter: 5'}); // 2 shadow roots adentro
await expect.element(button).toBeEnabled();
await expect.element(button).toHaveAccessibleName('Counter: 5');
```

Y `page.elementLocator(el)` + `toMatchAriaInlineSnapshot` compara el **árbol
ARIA completo** del componente con un snapshot literal, incluyendo el texto con
`slot`:

```yaml
- button "Hide session panel" [expanded]
- heading "Session progress" [level=2]
- progressbar "Session progress"
- button "Complete session"
- status
```

**Evidencia.** `test/counter-element-aria-cdp.test.ts:101` (bloque de locators),
`test/counter-element-aria-cdp.test.ts:477` (`toMatchAriaInlineSnapshot`),
`test/counter-element-aria-cdp.test.ts:486` (árbol programático).

**Verificado en.** `5.0.0-rc.1`.

---

## Referencia rápida

| Síntoma | Entrada |
| --- | --- |
| Tests verdes pero `Unhandled Rejection` con spy a 0 llamadas | [F1](#f1-clearmocks-ahora-es-true-por-defecto-rompe-aserciones-tardías) |
| `getFullAXTree` no ve tu DOM / iframe opaco | [F2](#f2-cdp-se-adjunta-a-la-página-orquestadora-no-al-iframe-del-test) |
| `valuenow` de un progressbar devuelve `undefined` por CDP | [F3](#f3-esquema-ax-el-valor-de-un-progressbar-no-está-en-properties) |
| `getByRole(..., {disabled:true})` no encuentra `aria-disabled` | [F4](#f4-el-filtro-disabled-de-getbyrole-ignora-aria-disabled) |
| No resuelves el botón real bajo un Web Component de Material | [F5](#f5-domqueryselector-solo-perfora-shadow-dom-con-la-raíz--shadow-root) |
| `toHaveFocus` falla/engaña dentro del Shadow DOM | [F6](#f6-tohavefocus-es-poco-fiable-para-elementos-internos-del-shadow-dom) |
| `Input.dispatchKeyEvent` no hace nada | [F7](#f7-inputdispatchkeyevent-no-llega-al-iframe-del-test) |
| Necesitas un clic "de sistema" que llegue al iframe | [F8](#f8-inputdispatchmouseevent-produce-clicks-reales-que-sí-llegan) |
| Probar `prefers-reduced-motion` / `forced-colors` | [F9](#f9-emulationsetemulatedmedia-afecta-a-matchmedia-en-tiempo-real) |
| `getByText` exacto no encuentra texto con `slot` | [F10](#f10-getbytext-exacto-falla-con-texto-con-slot) |
| Buscar/en-snapshot elementos dentro del Shadow DOM | [F11](#f11-patrón-positivo-los-locators-aria-perforan-el-shadow-dom-anidado) |

---

## Método de depuración

El meta-conocimiento que permitió resolver F1-F11. Orden de ataque ante un fallo
"raro" en Vitest 5 Browser Mode:

1. **Aislar.** `npx vitest run test/mi-suite.test.ts` — un solo archivo, un solo
   browser. Elimina la contaminación entre tests.
2. **Bisecar.** `-t "nombre del test"` filtra sin tocar el código. Si falla en
   aislamiento, el problema es del test/componente; si solo falla en suite, es
   contaminación de estado compartido (muy típico con un `beforeAll` compartido
   o un fake server global).
3. **Instrumentar in situ.** `console.log` dentro del callback sospechoso para
   ver el **orden real** de eventos y el estado en cada punto. Ejemplo que
   destapó F1: imprimir `spy.mock.calls.length` justo al entrar al callback y
   tras el `await`.
4. **Confirmar con override de config.** Para probar una hipótesis sobre un
   default, crea un config que lo invierta (`clearMocks: false`, etc.) y observa
   si el síntoma desaparece. Eso convierte una corazonada en causa confirmada.
5. **Reducir a repro mínimo.** Una vez confirmado, replica el patrón en un test
   de un solo caso. Si el repro mínimo pasa, la diferencia está en el contexto;
   ahí vuelve al paso 2.

Regla de oro: **un `Unhandled Rejection` es un bug de tu test, no del
componente.** "El evento no se dispara" es casi siempre "el evento se disparó
pero ya nadie lo ve".

---

## Cómo añadir una entrada

Sigue la plantilla de las entradas F1-F11:

1. **Síntoma** observable (y en qué se ve: runner, matcher, CDP).
2. **Causa raíz** (mecanismo, no la solución).
3. **Arreglo / patrón** con código mínimo.
4. **Evidencia** = ruta del test real + número de línea/`describe`.
5. **Verificado en** = versión de Vitest + provider.

Condiciones para incluirla: fue un comportamiento **inesperado** (no está en la
doc de Vitest), te costó > 15 min averiguarlo, y hay un test que lo demuestra.
Si es documentación oficial, no pertenece aquí; enlázala al handbook.
