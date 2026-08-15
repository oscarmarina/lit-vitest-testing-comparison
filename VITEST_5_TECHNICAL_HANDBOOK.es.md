# Vitest 5: Manual técnico para mantenedores

## De beta.1 a beta.6

**Audiencia:** autores de librerías y frameworks que necesitan razonar sobre el
modelo de ejecución de Vitest, no solo consumir su API pública.

**Política de evidencia:** las afirmaciones sobre un cambio de versión están
ancladas en el PR/commit, en el código etiquetado, en los tests o en la
documentación registrados en [el registro de investigación
(`VITEST_5_RESEARCH_LEDGER.md`)](./VITEST_5_RESEARCH_LEDGER.md). Cuando la
discusión pública de un PR no establece una justificación, este manual etiqueta
la conclusión como una *inferencia* a partir de la implementación, en lugar de
atribuirla a los mantenedores.

## Tabla de contenidos

1. [Arquitectura y titularidad del runtime](#1-arquitectura-y-titularidad-del-runtime)
2. [Contrato de API y configuración (breaking changes)](#2-contrato-de-api-y-configuración-breaking-changes)
3. [Browser Mode: protocolo, locators, diagnósticos, trazas y capturas](#3-browser-mode-protocolo-locators-diagnósticos-trazas-y-capturas)
4. [Mocking: transform, registro y ciclo de vida](#4-mocking-transform-registro-y-ciclo-de-vida)
5. [Reporters, artefactos, snapshots y UI](#5-reporters-artefactos-snapshots-y-ui)
6. [Cobertura y límites de proceso](#6-cobertura-y-límites-de-proceso)
7. [API de Expect, timers y API de benchmark](#7-api-de-expect-timers-y-api-de-benchmark)
8. [Catálogo de fiabilidad, diagnósticos y rendimiento](#8-catálogo-de-fiabilidad-diagnósticos-y-rendimiento)
9. [Runbook de migración para repositorios grandes](#9-runbook-de-migración-para-repositorios-grandes)
10. [Apéndices](#10-apéndices)

---

# 1. Arquitectura y titularidad del runtime

El centro de gravedad arquitectónico de Vitest 5 se desplaza hacia adentro. Los
sistemas de runner y de benchmark dejan de ser productos vecinos con fronteras
de paquete públicas y pasan a ser partes del propio modelo de runtime/tarea de
Vitest. Ese cambio explica notas de versión que de otro modo parecerían
independientes: el rediseño de la API de benchmark (#10113), la eliminación de
`@vitest/runner` (#10511), la combinación de informes multi-entorno (#10031), el
nuevo diagnóstico de módulos de test (#10516) y varias correcciones de
runner/pool que operan sobre el mismo límite de titularidad.

## 1.1 Mapa de dependencias

```text
CLI / createVitest
      │ resuelve proyectos y serializa la config
      ▼
Vitest node core ── pools ── worker RPC ── runtime worker
      │                                │
      │                                ├─ module runner / grafo de transform Vite
      │                                └─ runtime/runner/{collect,run,suite,hooks}
      ▼
grafo de tareas state + reported ── reporters / serialización blob / UI
      ▲
browser orchestrator ─ iframe tester ─ mismos tipos de tarea del runtime runner
```

El punto clave no es que el código se moviera. Es que la recolección y la
ejecución de tareas pasan a ser propiedad del paquete que posee el module
runner, el modelo de proyecto y el runtime público. Browser Mode ya no necesita
depender de un paquete de runner publicado por separado para ponerse de acuerdo
con la ejecución Node sobre un `Task`, la jerarquía de suites, el ciclo de vida
de los fixtures o la tarea reportada.

## 1.2 `@vitest/runner` se integra (#10511, beta.5)

### Resumen ejecutivo

Vitest elimina `@vitest/runner` como paquete publicado y reubica su
implementación bajo `packages/vitest/src/runtime/runner/`. El efecto público es
una ruptura de frontera de paquete; el efecto arquitectónico es una única
implementación de runtime compartida por Vitest, el tester de navegador, los
reporters, la integración con runners custom y las utilidades de tarea.

### Motivación y modelo anterior

Antes de v5, `packages/runner` era el dueño de la implementación del runner, de
sus tipos, de las utilidades de recolección, de las utilidades de tarea y de su
propia superficie pública/build. `packages/vitest` lo importaba a través de una
frontera de paquete del monorepo. Eso parecía modular, pero hacía que los
contratos internos más sensibles a versiones fueran publicables de forma
independiente. El paquete de navegador y la UI también tenían que consumir el
mismo vocabulario de tareas mediante imports de paquete.

La forma pública anterior permitía código como:

```ts
// package.json
{
  "dependencies": { "@vitest/runner": "^4.0.0" }
}

// custom-runner.ts
import { VitestTestRunner } from '@vitest/runner'
```

Ese import implica una promesa de compatibilidad para los internos de
recolección, los mapas de tarea, los hooks y los tipos de runner. La
implementación de v5 toma la decisión opuesta: son internos de Vitest, por lo
que su ciclo de vida debe seguir exactamente a `vitest`.

### Recorrido por la implementación

El commit `6d6e46b1` elimina el manifest de paquete del runner, su config de
rollup, su README, sus declaraciones, su index público y sus entry points de
utilidades. Mueve los archivos operativos casi literalmente a
`packages/vitest/src/runtime/runner/`:

```text
packages/runner/src/{collect,run,suite,hooks,fixture,...}
                  ↓
packages/vitest/src/runtime/runner/{collect,run,suite,hooks,fixture,...}
```

Después cambia a todos los consumidores para que importen a través de rutas de
runtime locales a Vitest. Esto no es un renombrado cosmético: el commit también
consolida los helpers de tarea en `packages/vitest/src/utils/tasks.ts` y expande
`runtime/runner/types.ts` para que el runtime sea dueño del grafo de tipos que
ejecuta. Entre los consumidores modificados están el orquestador/tester de
navegador, todos los reporters de Node, la ruta de diagnóstico de módulos, el
arranque de workers, los VM runners, typecheck, la integración de
snapshot/expect y los tests de custom runners.

El flujo de ejecución tras el movimiento es:

```text
Vite transforma un módulo de test
  -> la recolección de runtime AST de Vitest crea el grafo de suite/tareas
  -> runtime/runner ejecuta hooks, fixtures, tests y tareas hijas
  -> el worker serializa actualizaciones/resultados de tarea por RPC
  -> Node state registra módulos/tareas
  -> reporters, UI y blob merger consumen esa única representación de tarea
```

La lista de renombrados del commit es particularmente importante para los
colaboradores: `artifact.ts`, `collect.ts`, `context.ts`, `errors.ts`,
`fixture.ts`, `hooks.ts`, `map.ts`, `run.ts`, `setup.ts`, `suite.ts`,
`test-state.ts` y las utilidades de chain/suite/tag se movieron todas juntas. Un
cambio en la recolección de tareas tiene, por tanto, consecuencias en el runtime
y en los reporters, incluso cuando su diff inicial parece afectar solo a una API
de test.

### Impacto de API y de migración

`@vitest/runner` queda deprecado / deja de publicarse como paquete de
implementación soportado. No lo sustituyas por un import profundo de `vitest`:
las rutas internas no son deliberadamente una frontera de compatibilidad. Un
custom runner debería usar la superficie `TestRunner` documentada de
`vitest`/`vitest/node` apropiada al punto de extensión, fijar Vitest como peer
dependency y tratar la migración a v5 como una migración de fuente y no como un
simple upgrade de lockfile.

Para un paquete de ecosistema, prueba este fallo explícitamente:

```bash
rg -n "@vitest/runner|vitest/(runners|suite)" .
pnpm why @vitest/runner
```

La eliminación está conectada con #10222, que borra los entry points antiguos de
Vitest (`vitest/coverage`, `vitest/reporters`, `vitest/environments`,
`vitest/snapshot`, `vitest/runners`, `vitest/suite`, `vitest/mocker` y
`vitest/internal/module-runner`). Ambos cambios reducen la dependencia
accidental de la topología de implementación.

### Tests y evidencia de diseño

#10511 modifica fixtures de custom runners, tests de API pública, tests de
runner, tests de reporters, tests de navegador, fixtures DTS de no-dispose y
fixtures de typecheck. Esa amplitud es la evidencia de que el riesgo era la
propagación de contrato y no la novedad algorítmica. La guía de migración lista
el paquete como deprecado y orienta a los consumidores lejos de la frontera del
paquete. El PR no enlaza ningún RFC público; este capítulo no infiere ninguno.

**Referencias:** [PR #10511](https://github.com/vitest-dev/vitest/pull/10511),
[commit `6d6e46b1`](https://github.com/vitest-dev/vitest/commit/6d6e46b1),
[guía de migración v5 en beta.6](https://github.com/vitest-dev/vitest/blob/v5.0.0-beta.6/docs/guide/migration.md).

## 1.3 La ejecución de benchmark se convierte en un fixture de test ordinario (#10113, beta.4)

### Resumen ejecutivo

La antigua API `bench()` de ámbito de módulo y el modo benchmark separado se
sustituyen por un fixture `bench` que se entrega a un `test()` normal en un
archivo de benchmark. Un registro se ejecuta explícitamente con `.run()` o se
compone con `bench.compare()`. Los resultados pasan a ser datos de tarea que
consumen los reporters normales, y no un subsistema de reporting paralelo.

### Por qué la arquitectura anterior era insuficiente

El PR enlaza explícitamente [Discussion #7850](https://github.com/vitest-dev/vitest/discussions/7850)
y describe la inversión pretendida: el benchmark es parte de un test, en lugar
de ser él mismo un test. La revisión pública es inusualmente clara aquí: los
mantenedores caracterizan la implementación anterior como una "adición" más que
como algo integrado, y aprueban la eliminación de la abstracción `mode`
separada. Esa es la justificación de diseño, no una suposición a partir del
gusto por la API.

Bajo el modelo anterior, la recolección de benchmarks, la selección de runner,
el modo de CLI, los reporters especializados, el JSON de salida y los archivos
de comparación estaban acoplados. Eso dificultaba compartir fixtures/hooks,
usar retries/assertions de forma natural o reportar un benchmark a través del
pipeline normal de tareas/reportes.

```ts
// v4: un benchmark de ámbito de módulo es la unidad ejecutable
import { bench } from 'vitest'

bench('parse', () => JSON.parse('{"a":1}'))
```

El modelo de v5 hace que la frontera del test sea dueña de la vida, el
comportamiento de retry, el filtrado y las aserciones:

```ts
import { expect, test } from 'vitest'

test('parse es más rápido que el parser custom', async ({ bench }) => {
  const result = await bench.compare(
    bench('JSON.parse', () => JSON.parse('{"a":1}')),
    bench('custom parser', () => customParse('{"a":1}')),
    { iterations: 100, time: 1_000 },
  )

  expect(result.get('JSON.parse')).toBeFasterThan(result.get('custom parser'))
})
```

El archivo debe coincidir con `benchmark.include` (por defecto un nombre de
archivo `.bench.*`/`.benchmark.*`). El fixture está intencionalmente disponible
solo en un archivo de test normal: la selección de archivo decide si un proyecto
es un proyecto de benchmark; el uso del fixture no cambia silenciosamente la
semántica del proyecto.

### Implementación interna

El PR es una reescritura de 136 archivos, que añade `runtime/benchmark.ts`
(565 líneas añadidas), una integración con Chai para matchers de rendimiento,
manejo de resultados de benchmark en Node, un renderer genérico de tablas de
benchmark, plomería de config/proyecto, soporte RPC de navegador, una nueva guía
de 480 líneas y una gran reescritura de tests end-to-end/DTS. Elimina el antiguo
runner de benchmark y el antiguo directorio de reporters especializados de
benchmark.

En runtime, `createBench(test, config)` es dueño de un conjunto de registros
para *un* test. Una llamada a `bench(name, fn)` registra una tarea `Tinybench`
perezosa. `.run()` materializa una instancia de Tinybench con el `AbortSignal`
del test actual; `bench.compare()` carga todos los registros en una sola
ejecución de Tinybench, de modo que su intercalado es significativo. El
resultado se serializa en `test.benchmarks`, se envía por RPC de worker con
`onTestBenchmark` y lo renderizan las rutas estándar de reporters.

```text
el callback del test recibe el fixture bench
    -> bench(...) registra una o más tareas candidatas
    -> run()/compare() ejecuta Tinybench bajo el AbortSignal del test
    -> el resultado de benchmark se normaliza en TestBenchmark / TestBenchmarkTask
    -> el RPC de worker lo reporta como dato asociado al test
    -> los reporters base/json/default renderizan el mismo grafo de tareas
```

`bench.from()` suministra una baseline almacenada en lugar de una función
invocable, mientras que `writeResult` persiste un resultado exitoso. `perProject`
marca una tarea para agregarse después de las ejecuciones del proyecto. La
implementación sustituye `${projectName}` solo durante la resolución de la ruta
de resultados y rechaza una baseline almacenada ausente en lugar de tratarla
como una comparación vacía silenciosa. `getter-tracker` se reinicia alrededor de
la ejecución del benchmark para detectar exports cuyos getters se invocan en
exceso — una señal importante porque el overhead de getters puede dominar un
microbenchmark.

`toBeFasterThan`/`toBeSlowerThan` validan la forma del resultado, comparan la
latencia media y admiten un umbral `delta`. Su API expone deliberadamente
assertions estándar para umbrales absolutos también; ningún matcher convierte
una medición ruidosa en una garantía ambiental estable.

### Superficie eliminada y riesgos de migración

| Superficie v4 | Sustituto v5 | Consecuencia |
| --- | --- | --- |
| `bench` de ámbito de módulo | `test(..., async ({ bench }) => ...)` | El benchmark tiene ciclo de vida de test |
| `bench.skip/only/todo` | `test.skip/only/todo` | El filtrado vive en la frontera del test |
| `benchmark.reporters/outputFile` | reporters de nivel superior / `--outputFile` | Un único sistema de reporting |
| `benchmark.compare`, `--compare` | `writeResult`, `bench.from`, `bench.compare` | La baseline almacenada es explícita |
| `benchmark.outputJson`, `--outputJson` | JSON reporter | Los benchmarks aparecen en la salida JSON ordinaria de tareas |
| `Vitest.mode === 'benchmark'` | siempre `'test'` | El benchmark es un proyecto dedicado, no un modo de instancia |

No pongas configuración de carga de trabajo accidentalmente dentro del callback
medido. Pon la configuración de fixtures en las opciones del benchmark
(`beforeEach`, `beforeAll`) cuando no deba medirse; usa un `writeResult` por
benchmark solo en un entorno controlado y comparable. En CI, ejecuta las
assertions de rendimiento con un delta y una clase de runner estable, y luego
conserva el reporte JSON crudo para diagnóstico.

**Referencias:** [PR #10113](https://github.com/vitest-dev/vitest/pull/10113),
[Discussion #7850](https://github.com/vitest-dev/vitest/discussions/7850),
[commit `19f6e894`](https://github.com/vitest-dev/vitest/commit/19f6e894),
[guía de benchmark en beta.6](https://github.com/vitest-dev/vitest/blob/v5.0.0-beta.6/docs/guide/benchmarking.md),
[implementación en runtime](https://github.com/vitest-dev/vitest/blob/v5.0.0-beta.6/packages/vitest/src/runtime/benchmark.ts).

## 1.4 La combinación de informes es un problema de identidad de tarea (#10031, beta.2)

### Resumen ejecutivo

`--merge-reports` se extiende a ejecuciones multi-entorno no shardeado. La
funcionalidad no es concatenación de archivos: debe reconstruir el grafo de
tareas/módulos reportado a través de los proyectos y de raíces de proyecto
potencialmente diferentes, y luego dar a los reporters/UI una ejecución completa
y consistente en identidad.

### Consecuencias internas

#10031 cambia la recolección, la construcción de suites, la recolección AST, la
recolección de typecheck, la serialización de proyecto/config, el estado, el
`TestSpecification`, el `TestRun`, el estado del orquestador de navegador, el
blob reporter, los reporters base/summary y las vistas del explorer de UI. La
expansión de tests end-to-end de merge-reports de 477 líneas es la evidencia más
fuerte disponible de los casos previstos: los entornos no shardeados no son
meramente una segunda etiqueta de shard.

Los arreglos posteriores explican los invariantes que la primera funcionalidad
estableció:

* #10318 serializa un módulo cuyo subpath de import no existe.
* #10346 evita que una etiqueta de informe corrompa el nombre de archivo del
  blob.
* #10348 conserva `testModules` en `onTestRunEnd` cuando los blobs se originan
  en directorios raíz diferentes.
* #10338 preserva los metadatos de fuente para ese mismo caso de raíz diferente
  en la salida HTML.
* #10570/#10578 calculan el tiempo de transform correctamente tras el merge.

Trata un blob combinado como estado de ejecución serializado con referencias de
módulo/tarea, metadatos de fuente, tiempos e identidad de entorno. Un merger que
solo sea correcto para trabajos shardeados con rutas idénticas seguirá
produciendo salida HTML/UI plausible pero incompleta.

### Contrato práctico

Adopta el default `.vitest/blob` (#10232) junto con `createReport` (#9993), y
convierte la recolección de informes en un paso de artefacto de CI en lugar de
rascar la salida de consola. Todos los agentes que vayan a combinar deben usar
una versión compatible de Vitest y conservar sus árboles de artefactos. Prueba
una matriz con al menos dos raíces de proyecto y dos entornos; inspecciona tanto
la salida JUnit/JSON como la HTML/UI, no solo el código de salida.

**Referencias:** [PR #10031](https://github.com/vitest-dev/vitest/pull/10031),
[PR #9993](https://github.com/vitest-dev/vitest/pull/9993),
[PR #10348](https://github.com/vitest-dev/vitest/pull/10348),
[PR #10338](https://github.com/vitest-dev/vitest/pull/10338),
[commit `e60b2f49`](https://github.com/vitest-dev/vitest/commit/e60b2f49).

## 1.5 Checklist de migración específica de arquitectura

- Elimina las dependencias directas de `@vitest/runner` y de los entry points
  `vitest/*` eliminados.
- Convierte los archivos de benchmark a la API de fixture; conserva el
  descubrimiento `.bench.*` y haz `await` de `.run()` / `bench.compare()`.
- Trata la salida de benchmark como salida estándar de reporter; elimina la
  configuración retirada de reporter/compare/output JSON de benchmark.
- Guarda blobs, salida de reportes y adjuntos como artefactos de build bajo
  `.vitest`.
- Valida la salida combinada con raíces/envíos de proyecto distintos, incluidos
  los enlaces de fuente y los totales de módulos.
- Actualiza el código de reporters que interpreta los IDs de worker: en v5 son
  de base 1 y `TestModule.diagnostic()` ahora también expone `concurrencyId`.

---

# 2. Contrato de API y configuración (breaking changes)

Vitest 5 convierte varias convenciones antes permisivas en contratos explícitos.
Los cambios comparten una dirección: la configuración debe tener un dueño
determinado; la semántica del runtime debe tener una sola polaridad; la salida
generada debe estar aislada y ser descubrible; y el detalle de implementación
importable públicamente no debe confundirse con API soportada.

Este capítulo cubre #10178, #10198, #10194, #10186, #10334, #10428, #10222,
#10221, #10511, #10373, #10516, #10620, #10621, #10583, #10293, #10651 y los
arreglos de configuración/reporting relacionados registrados en el registro de
investigación.

## 2.1 Suelo de plataforma: Node 22 y Vite 6.4 (#10178, beta.3)

### Resumen ejecutivo

Vitest 5 requiere Node.js 22.12.0 o superior y Vite 6.4.0 o superior. Es un
límite de soporte duro, no un rango de peer-dependency consultivo: un proyecto
que conserve un runtime antiguo queda fuera del modelo de ejecución probado de
la versión.

### Por qué es arquitectónico

Vitest es dueño de un server/grafo de módulos de Vite, usa pools de
worker/process de Node, serializa la configuración derivada de Vite hacia los
workers y los clientes de navegador, y debe mantener un contrato único de
transformación/runtime. Soportar versiones antiguas de Vite crearía semánticas
de plugin/config diferentes bajo la misma API de Vitest. Soportar Node antiguo
multiplicaría las rutas de compatibilidad de worker, VM, cobertura, inspector,
globals y resolución de paquetes. La documentación raíz del repositorio y la
guía de migración hacen del suelo parte del contrato del producto.

El suelo de Node también contextualiza #10293: el comportamiento perezoso de
`localStorage` de Node 26 puede lanzar mientras se inspeccionan propiedades
globales, y un worker que no puede arrancar debe producir un error normal de
Vitest en lugar de un crash secundario. No leas ese fix de bugs como una
afirmación de soporte de Node 26 por sí solo; es manejo defensivo en la frontera
de arranque de global/worker.

### Migración

```json
{
  "engines": {
    "node": ">=22.12.0"
  },
  "devDependencies": {
    "vite": "^6.4.0 || ^7.0.0 || ^8.0.0",
    "vitest": "5.0.0-beta.6"
  }
}
```

Fija la imagen de CI antes de cambiar Vitest. Verifica el Vite resuelto de cada
workspace, incluidos los paquetes que listan Vite como peer dependency:

```bash
node --version
pnpm -r why vite
pnpm -r exec vitest --version
```

Los autores de librerías deberían anunciar un rango de peer de Vitest solo
cuando su helper exportado usa APIs de Vitest; la configuración de test de una
aplicación pertenece a las dev dependencies. No intentes paliar Node/Vite
antiguos con aliases: los invariantes del runner son más amplios que los
imports.

**Referencias:** [PR #10178](https://github.com/vitest-dev/vitest/pull/10178),
[commit `3876283e`](https://github.com/vitest-dev/vitest/commit/3876283e),
[prerrequisitos de migración](https://github.com/vitest-dev/vitest/blob/v5.0.0-beta.6/docs/guide/migration.md).

## 2.2 Un único vocabulario de concurrencia (#10198 y #10194, beta.2)

### Resumen ejecutivo

`test.sequential`, `describe.sequential` y `{ sequential: true }` se eliminan.
Usa la bandera `concurrent` existente con el booleano opuesto cuando una
tarea/suite deba sobreescribir el paralelismo heredado o global:
`{ concurrent: false }`.

### Comportamiento anterior y modo de fallo

Dos formas negadas de describir el orden hacían innecesariamente sutil la
combinación de opciones:

```ts
// v4: dos APIs describen la misma intención de planificación
describe.sequential('database', () => {
  test.sequential('writes', write)
})

test('global override', { sequential: true }, serial)
```

Esto no es solo sintaxis. Un `sequence.concurrent: true` global y una opción
local sequential requieren una regla de precedencia inequívoca. #10194 añade
cobertura de regresión para el caso específico en el que un `test(..., { concurrent: false })`
de nivel superior debe sobreescribir el ajuste global. #10198 elimina la grafía
paralela deprecada una vez que la regla es expresable en la API superviviente.

```ts
// v5: la concurrencia es el único eje y false opta fuera explícitamente
describe('database', { concurrent: false }, () => {
  test('writes', { concurrent: false }, write)
})

export default defineConfig({
  test: { sequence: { concurrent: true } },
})
```

### Impacto interno y de ecosistema

El runner almacena las banderas encadenables durante la recolección y combina
las opciones de tarea/suite antes de programar los callbacks. Por eso importan
los arreglos adyacentes: #10187 propaga las banderas encadenables a través de
`describe.for`; #10179 limita la concurrencia por rama de tarea además de en los
callbacks hoja; #10216 arregla las opciones de suite heredadas en la API de
tareas; y #10659 arregla una fuga de configuración `sequence` por proyecto. La
migración pública es un renombrado, pero el objetivo interno es asegurar que la
metadata de recolección describa el mismo árbol que el scheduler ejecuta
después.

Para un monorepo, migra todos los aliases antes de alterar la planificación
global. Una búsqueda mecánica es segura, pero la verificación semántica sigue
siendo necesaria para suites anidadas:

```bash
rg -n "\.(sequential)\(|\bsequential\s*:" --glob '*.{ts,tsx,js,jsx,mts,cts}'
```

Reemplaza solo las APIs de test/suite. No reescribas propiedades de aplicación
no relacionadas que se llamen `sequential`. Luego añade una suite de regresión
que registre inicios/fines bajo la configuración de proyecto/sequence exacta
usada en CI.

**Referencias:** [PR #10198](https://github.com/vitest-dev/vitest/pull/10198),
[PR #10194](https://github.com/vitest-dev/vitest/pull/10194),
[PR #10179](https://github.com/vitest-dev/vitest/pull/10179),
[PR #10659](https://github.com/vitest-dev/vitest/pull/10659).

## 2.3 El descubrimiento de configuración tiene una raíz acotada (#10428, beta.5)

### Resumen ejecutivo

Cuando `vitest` arranca en un subdirectorio, ya no recorre los directorios
ancestros para encontrar un archivo de configuración. La titularidad de la
configuración es la ruta explícita `--config` o el contexto de invocación
actual/raíz.

### Comportamiento anterior y nuevo

```text
repo/
  vitest.config.ts
  packages/widget/
```

```bash
# v4: podía adoptar silenciosamente repo/vitest.config.ts
cd repo/packages/widget && vitest

# v5: haz la titularidad explícita
cd repo/packages/widget && vitest --config ../../vitest.config.ts --dir .
```

El ascenso antiguo es especialmente peligroso en un workspace: una invocación a
nivel de paquete puede recoger los aliases, setup files, projects, umbrales de
cobertura, opciones de servidor de navegador y rutas de salida de un proyecto
padre sin que la línea de comandos revele ese hecho. #10428 cambia
`resolveConfig`, el manejo público de plugins de config, las rutas de creator y
los tests de CLI config; es un cambio de frontera de descubrimiento, no
simplemente una optimización de búsqueda de archivos.

### Migración y validación en CI

Haz que cada script de paquete sea autocontenido. Prefiere invocar desde la raíz
del repositorio con un filtro/config explícito, o usa un archivo de
configuración local al paquete. Añade un job de CI que ejecute el directorio de
trabajo exacto que usan los editores/task runners; no pruebes solo el script de
la raíz. Para configs generadas, resuelve su ruta relativa al script que llama,
no a la ascendencia del proceso.

**Referencias:** [PR #10428](https://github.com/vitest-dev/vitest/pull/10428),
[commit `945d9090`](https://github.com/vitest-dev/vitest/commit/945d9090).

## 2.4 `.vitest` es el namespace de artefactos (#9993, #10186, #10232, #10620, #10621)

### Resumen ejecutivo

Vitest converge los artefactos de test generados en `<project-root>/.vitest`.
Los adjuntos, los informes blob, el informe HTML, la salida JSON y la salida
JUnit reciben cada uno subrutas predecibles. Es un contrato de filesystem y de
CI rompedor.

### Transición completa de defaults

| Productor | Comportamiento previo/default | Default v5 |
| --- | --- | --- |
| adjuntos (#10186) | `.vitest-attachements/` (con errata) | `.vitest/attachments/` |
| blob / merge (#10232) | `.vitest-reports/blob-*.json` | `.vitest/blob/blob-*.json` |
| HTML (#10620) | `html/index.html` | `.vitest/index.html` |
| JSON (#10621) | stdout | `.vitest/json/output.json` |
| JUnit (#10621) | stdout | `.vitest/junit/output.xml` |

#9993 proporciona `createReport` y establece la convención de raíz de informe.
#10334 hace entonces que `attachmentsDir` sea de solo raíz: no puede variar por
proyecto porque la búsqueda de artefactos, el reporting y la limpieza necesitan
un dueño compartido. #10232 mueve el blob reporter y `--merge-reports` al mismo
namespace. La beta final mueve los reporters orientados a usuario, convirtiendo
las suposiciones de stream de consola en artefactos de archivo por defecto.

Es un diseño para CI componible, no solo para salida de terminal:

```text
test worker / comando de navegador
       -> resultado de adjunto o reporter
       -> <root>/.vitest/<productor>/...
       -> CI sube un único árbol de artefactos
       -> un job de merge/reporte lo consume
```

### Migración

```gitignore
# una sola regla cubre el estado generado de Vitest y los informes
.vitest/
```

```ts
// Conserva un pipeline de JSON a stdout solo donde un comando downstream lo requiera.
export default defineConfig({
  test: {
    reporters: [['json', { stdout: true }]],
  },
})
```

De lo contrario, reemplaza `vitest --reporter=json | jq` con `jq . .vitest/json/output.json`.
Cuando un uploader de CI existente espere `coverage/` o `html/`, actualiza la
ruta y añade el árbol de artefactos a los outputs del job. Cuidado con las
ejecuciones concurrentes: #10466 hace que un `coverage.reportsDirectory`
colisionante falle rápido, una regla complementaria que evita que una ejecución
borre o sobreescriba los archivos de cobertura de otra.

### Migración de la opción del HTML reporter

El cambio de salida HTML también desplaza su modelo de opciones de `outputFile`
(un archivo) a `outputDir` (un directorio), mientras #10235 añade un modo
deliberado de salida de archivo único. Elige el primero al alojar un directorio
de assets; elige el segundo para un visor de artefactos/adjunto tipo email. No
asumas que `outputFile` sigue seleccionando un documento index en v5.

**Referencias:** [PR #9993](https://github.com/vitest-dev/vitest/pull/9993),
[PR #10186](https://github.com/vitest-dev/vitest/pull/10186),
[PR #10232](https://github.com/vitest-dev/vitest/pull/10232),
[PR #10620](https://github.com/vitest-dev/vitest/pull/10620),
[PR #10621](https://github.com/vitest-dev/vitest/pull/10621),
[PR #10466](https://github.com/vitest-dev/vitest/pull/10466).

## 2.5 Contracción del paquete público y de los entry points (#10221, #10222, #10511, #10675)

### Resumen ejecutivo

v5 integra `@vitest/expect` y `@vitest/runner`, elimina los entry points
`vitest/*` deprecados y elimina el paquete de provider WebdriverIO integrado. La
superficie soportada es más estrecha y más intencional.

### Migración exacta de entry points

| Import eliminado | Sustituto soportado |
| --- | --- |
| `vitest/coverage`, `vitest/reporters` | `vitest/node` |
| `vitest/environments`, `vitest/snapshot` | `vitest/runtime` |
| `vitest/runners` | `TestRunner` desde `vitest` |
| `vitest/suite` | métodos estáticos de `TestRunner` desde `vitest` |
| `vitest/mocker` | `@vitest/mocker` |
| `vitest/internal/module-runner` | sin sustituto soportado |

Integrar `@vitest/expect` (#10221) hace que el código de expectativas de
navegador importe la implementación de Vitest directamente; no concede a los
consumidores un nuevo contrato de import interno. La integración del runner se
explica en el capítulo 1. #10675 elimina el paquete mantenido
`@vitest/browser-webdriverio` y transfiere el soporte de WebdriverIO al paquete
comunitario; los proyectos dependientes del provider deben actualizar su
dependency y sus expectativas de enrutamiento de issues.

Usa auditorías tanto de fuente como de dependencias:

```bash
rg -n "from ['\"](vitest/(coverage|reporters|environments|snapshot|runners|suite|mocker|internal/module-runner)|@vitest/(runner|expect|browser-webdriverio))" .
pnpm -r why @vitest/runner @vitest/expect @vitest/browser-webdriverio
```

**Referencias:** [PR #10221](https://github.com/vitest-dev/vitest/pull/10221),
[PR #10222](https://github.com/vitest-dev/vitest/pull/10222),
[PR #10511](https://github.com/vitest-dev/vitest/pull/10511),
[PR #10675](https://github.com/vitest-dev/vitest/pull/10675).

## 2.6 Globals de entorno e IDs de diagnóstico (#10373 y #10516)

### Propagación de globals de DOM

#10373 cambia la integración de jsdom/happy-dom para que la asignación al global
de test también actualice el `window` subyacente. Eso importa cuando la propia
implementación del DOM lee después la propiedad, por ejemplo un `innerWidth`
mockeado usado por `matchMedia`.

```ts
// v5: la asignación al global de test afecta a la implementación DOM de respaldo
globalThis.innerWidth = 480
expect(window.matchMedia('(max-width: 500px)').matches).toBe(true)
```

La misma frontera de entorno tiene un cambio roto más sutil: `populateGlobal`
ahora registra los property descriptors en `originals`, no valores leídos con
avidez. Los consumidores de un entorno custom deben restaurar los descriptors
con `Object.defineProperty`; la asignación invocaría/ajustaría incorrectamente
para accessors y no puede restaurar fielmente las banderas. El cambio evita
disparar los globals perezosos de Node durante la captura.

### Identidad del worker

#10516 cambia `VITEST_POOL_ID` y `VITEST_WORKER_ID` a valores de base 1 y añade
`concurrencyId` a `TestModule.diagnostic()`. No uses nunca ninguno de estos
identificadores como índice de array directo. Úsalo como clave de partición
opaca o resta uno en el punto estrecho donde un índice sea realmente necesario.
Los IDs de pool de navegador y de Node pueden repetirse porque pertenecen a
pools separados.

```ts
onTestModuleEnd(module) {
  const { workerId, concurrencyId } = module.diagnostic()
  publish({ worker: `worker-${workerId}`, concurrencyId })
}
```

**Referencias:** [PR #10373](https://github.com/vitest-dev/vitest/pull/10373),
[PR #10516](https://github.com/vitest-dev/vitest/pull/10516).

## 2.7 El acceso a la UI está autenticado, no meramente oculto (#10583)

### Resumen ejecutivo

La ruta HTML y la API de la UI de Vitest requieren un token de autenticación.
Una URL desnuda de `/__vitest__/` ya no es una capacidad aceptable; los usuarios
abren la URL tokenizada que emite Vitest, tras lo cual la ruta directa funciona
para ese contexto autenticado.

### Implementación y frontera de amenaza

#10583 añade `packages/vitest/src/node/config/apiToken.ts`, enhebra la
resolución de token por las rutas de creación/config/plugin y cambia la
integración Node del paquete de UI. Los tests cubren los helpers de UI, editor,
trace y streaming porque todos usan la superficie de API. La guía de migración
describe el modo de fallo práctico: una URL de UI abierta manualmente muestra un
error hasta que se autentica.

Esto debe leerse junto con #10444 (API CDP de cliente deshabilitada cuando
`write`/`exec` está prohibido), #10674 (los comandos de navegador integrados
comprueban el acceso a filesystem), #10522 (la URL del orquestador requiere un
ID de sesión) y #10412 (escape de scripts inline del orquestador). Juntos,
definen el puente navegador/UI como una capacidad de servidor controlada por
acceso.

No publiques una URL tokenizada copiada, no la incluyas en logs de CI ni hagas
reverse-proxy de la UI sin preservar la frontera de acceso prevista. Si un
workflow de preview necesita acceso de navegador, arranca Vitest en ese proceso
controlado y consume su URL generada en lugar de hardcodear rutas internas.

**Referencias:** [PR #10583](https://github.com/vitest-dev/vitest/pull/10583),
[PR #10444](https://github.com/vitest-dev/vitest/pull/10444),
[PR #10674](https://github.com/vitest-dev/vitest/pull/10674),
[PR #10522](https://github.com/vitest-dev/vitest/pull/10522).

## 2.8 Checklist de migración de configuración

- Sube Node y Vite antes de cambiar Vitest; ejecuta la imagen real de CI local
  o en un job de CI aislado.
- Reemplaza todas las APIs/opciones sequential por `concurrent: false`; prueba
  el comportamiento sequence anidado y por proyecto.
- Haz explícita cada ruta de configuración desde directorios de trabajo no
  raíz.
- Ignora y sube `.vitest/`; actualiza deliberadamente cada consumidor de
  informes/artefactos y el parser de stdout.
- Establece directorios de informes de cobertura únicos para jobs concurrentes.
- Reemplaza los entry points/paquetes eliminados; migra WebdriverIO a su
  provider comunitario antes de actualizar los tests de Browser Mode.
- Actualiza los entornos custom para restaurar los property descriptors
  globales.
- Audita los nombres de recurso/indexado de arrays derivados de worker-ID por el
  cambio a base 1.
- Trata las URLs de UI y de servidor de navegador como credenciales/capacidades,
  no como rutas estáticas públicas estables.

---

# 3. Browser Mode: protocolo, locators, diagnósticos, trazas y capturas

Browser Mode no es un runner de test de Node con un DOM remoto añadido. Es un
sistema de test distribuido: el proceso Node de Vite es dueño del
descubrimiento, las sesiones, los permisos, los comandos de provider, los
artefactos y el reporting; una página orquestadora es dueña de la vida del
iframe y del puente de UI; cada iframe tester importa/transforma/ejecuta los
módulos de test en un navegador real; un provider realiza la automatización
privilegiada. Casi todos los cambios de beta de Browser Mode son una corrección
o un endurecimiento de una de esas fronteras.

Este capítulo cubre #9745, #10171, #10102, #10212, #10138, #10227, #10218,
#10257, #10302, #10296, #10329, #10283, #9957/#10267, #10355, #10391, #10389,
#10412, #10444, #10386, #10430, #10404, #10437, #10522, #10397, #10497,
#10520/#10521, #10592, #10656, #10626, #10662, #10674 y #10675.

## 3.1 Topología de ejecución y ciclo de vida

```text
Vitest Node core / Vite server
  │ crea una sesión de navegador; resuelve proyecto/config; arranca el provider
  │  RPC: comandos, grafo de módulos, eventos de tarea, cobertura, artefactos
  ▼
HTML orquestador ligado a sesión (/__vitest_test__/?sessionId=...)
  │ readiness de websocket -> onOrchestratorReady
  │ es dueño de UI, trazas, creación de iframe y viewport
  ├── aislado: un iframe tester por archivo, prepare -> execute -> cleanup
  └── no aislado: un iframe, ejecuta el conjunto de archivos -> cleanup tras el run
  ▼
iframe tester
  │ handshake / readiness; carga los módulos de test transformados por Vite
  │ ejecuta el runtime de Vitest y la Locator API en el DOM real
  ▼
provider (Playwright, preview o WebdriverIO comunitario)
  resuelve los locator selectors serializados; realiza comandos de filesystem/automatización
```

`IframeOrchestrator.createTesters()` es el coordinador de ciclo de vida. Espera
la inicialización de la traza, establece un span de OpenTelemetry, limpia/reusa
el estado del iframe según `browser.isolate`, ajusta el viewport y envía
`execute` con las especificaciones de archivo, el método, el contexto
proporcionado, `concurrencyId` y `workerId`. Un run aislado limpia cada iframe
después de su archivo para que los recursos/la cobertura puedan finalizarse; un
run no aislado retrasa la limpieza para preservar el estado compartido del
navegador hasta que terminen todos los archivos.

Ese ciclo de vida explica los cambios de arranque:

* #10522 hace que la petición HTML del orquestador requiera `sessionId`; una URL
  interna desnuda no puede adjuntarse a un servidor arbitrario.
* #10397 espera la readiness de websocket del orquestador antes de resolver una
  sesión de navegador.
* #10497 espera la readiness del iframe tester antes de la preparación/ejecución.
* #10656 da a la comunicación del iframe un timeout de handshake, produciendo un
  fallo acotado en lugar de un run pendiente indefinidamente.
* #10520/#10521 codifican en URL el `iframeId`, evitando la corrupción de
  identidad de ruta/query para nombres de archivo con caracteres significativos
  en URL.

Son contratos de orden. Reintentar un test de navegador fallido no reparará un
servidor que empezó a ejecutarse antes de que su par receptor pudiera procesar
el mensaje; el arreglo es la barrera de readiness y un timeout explícito.

## 3.2 Los locators son dos representaciones, no elementos DOM (#10212)

### Resumen ejecutivo

Los comandos de navegador reciben ahora un objeto `SerializedLocator` en lugar
de una cadena desnuda:

```ts
type SerializedLocator = {
  selector: string // selector consumible por el provider
  locator: string  // expresión legible de Vitest/Playwright-style para diagnóstico
}
```

El primer campo impulsa la automatización. El segundo conserva la intención de
diagnóstico para trazas y errores. Una cadena solo podía hacer lo primero.

### Contrato de comando anterior y nuevo

```ts
// v4 custom command
export async function click(
  context: BrowserCommandContext,
  selector: string,
) {
  await context.page.locator(selector).click()
}

// v5 custom command
export async function click(
  context: BrowserCommandContext,
  target: SerializedLocator,
) {
  await context.page.locator(target.selector).click()
}
```

No reemplaces `target` por `String(target)`: eso pierde el selector y oculta una
firma de comando incompatible. Actualiza juntos todas las declaraciones de tipos
de comando, los adaptadores de provider, los test doubles y las assertions de
traza.

### Implementación interna

El `Locator` abstracto lleva un selector, usa un engine de selectores Ivya
configurado desde `browser.locators` y serializa antes de cada comando remoto.
`click`, `fill`, `hover`, `upload`, las APIs de screenshot/mark y la selección
enrutan todas a través del puente de comandos. Un elemento DOM suministrado a la
selección se convierte en un selector CSS y en una expresión de locator Ivya
legible, preservando el mismo contrato dual.

```text
page.getByRole(...)
  -> Locator (la composición de selector sigue siendo perezosa)
  -> Locator.serialize(): { selector, locator }
  -> RPC de comando
  -> el provider usa el selector contra la página real del navegador
  -> trace/error/UI renderiza la expresión del locator
```

El diff de #10212, de 54 archivos, cambia tanto los adaptadores de comando de
Playwright como los de WebdriverIO, las declaraciones de contexto de navegador,
las capturas de pantalla, las trazas, el código de orquestador/tester, la vista
de trace de la UI, la metadata del paquete mocker y 370 líneas de tests de
traza. Esa amplitud es esperable: el formato de red se sienta sobre todas las
abstracciones de navegador.

## 3.3 La exactitud es un endurecimiento semántico deliberado (#10430, #10473, #10626)

`browser.locators.exact` ahora es `true` por defecto. Queries como
`getByText('Save')` son coincidencias completas y sensibles a mayúsculas a menos
que el llamador suministre una query intencionalmente más amplia o cambie la
configuración. El riesgo de migración son los falsos negativos en tests que
dependían accidentalmente de coincidencia parcial; el beneficio es que un
locator describe el contrato de UI que se asevera, en lugar de un substring
ambiguo.

La capa de expectativas sigue la misma regla. `toHaveTextContent` ahora espera
igualdad exacta de cadenas y ya no acepta `RegExp`; la semántica de
parcial/regex pasa a `toMatchTextContent`:

```ts
await expect.element(page.getByRole('alert'))
  .toHaveTextContent('Saved')

await expect.element(page.getByRole('alert'))
  .toMatchTextContent(/saved/i)
```

Usa la exactitud para textos estables de componente/valores ARIA. Usa
`toMatchTextContent` cuando el producto incluya intencionalmente prefijos
dinámicos, contadores o contenido variable localizado. No desactives
globalmente la exactitud solo para conservar tests poco especificados.

#10626 completa el contrato de timeout derivando un timeout de acción
estrictamente positivo. Un bucle de reintento de acción con timeout cero o
negativo no es ni inmediato ni bien definido; las implementaciones de provider
necesitan una deadline positiva para programar el comportamiento de
retry/timeout.

## 3.4 Diagnósticos de ARIA y Shadow DOM (#10171, #10218, #10257, #10227)

Vitest usa Ivya, una capa de selector/ARIA derivada de Playwright, de modo que
un error de locator puede informar de una vista de árbol de accesibilidad del
estado real del navegador. #10171 exporta sus utilidades ARIA; #10218 actualiza
Ivya para evitar un snapshot ARIA vacío; #10257 saca ese árbol a la superficie
en los errores de locator. Esto cambia el diagnóstico de fallo de "el selector
no coincidió" a "este es el árbol de rol/nombre que expuso el navegador".

El diseño es especialmente valioso para Web Components: el texto visible del
Shadow DOM y el árbol accesible pueden divergir; un selector CSS puede cruzar
una frontera de forma diferente a una query ARIA. #10227 corrige el
resaltado de trazas para Shadow DOM en WebdriverIO. Trátalo como paridad de
renderizado del provider, no como evidencia de que cada interacción con shadow
root tiene semánticas de provider idénticas. Mantén tests de navegador
específicos del provider para roots cerrados, frames cross-origin y
comportamiento accesible compuesto.

## 3.5 Protocolo de trazas, marks custom y snapshots de DOM

Las entradas de traza son datos de ejecución estructurados, no capturas de
pantalla pegadas en un informe. La serialización del locator suministra la
identidad del elemento; el código del tester registra comandos y marks; el
orquestador/UI renderiza las actualizaciones; los providers pueden añadir
detalles de automatización.

| Cambio | Efecto |
| --- | --- |
| #10102 | la vista de traza puede renderizar snapshots de DOM |
| #10302 | `page.mark` acepta un `kind` custom |
| #10329 | los comandos custom pueden crear entradas de traza con `context.mark` |
| #10296 | la UI de watch recibe actualizaciones de traza en vivo |
| #10404 | el panel de editor muestra pasos de traza |
| #10437 | la UI renderiza marks anidados |

`Locator.mark(name, options)` solo envía trabajo cuando un test actual tiene
estado activo de grabación/vista de traza. Serializa el locator y preserva un
stack suministrado o capturado. Eso evita overhead de comandos para tests sin
trazado y permite que los comandos custom creen pasos anidados con nombre
semántico.

```ts
// un provider/comando custom puede hacer visible una frontera de traza a nivel de aplicación
await context.mark('seed authenticated account', { kind: 'fixture' })
```

Usa marks en fronteras de comando transversales, no en cada llamada de helper.
La traza es un artefacto de incidente/depuración; los marks excesivos oscurecen
la secuencia causal y añaden trabajo de serialización/UI.

## 3.6 Capturas de pantalla y artefactos visuales (#9745, #10138, #10592)

#9745 arregla la escala del iframe, una corrección fundacional porque las
coordenadas de captura y los resaltados de traza deben dar cuenta de la relación
entre la página del orquestador, la escala CSS/layout del iframe y el viewport
del provider. #10138 proporciona la referencia de proyecto a
`ToMatchScreenshotResolvePath`, haciendo la resolución de rutas custom
consciente de proyecto en un workspace. #10592 separa la colocación de capturas
de referencia de las capturas generales de navegador:

```ts
export default defineConfig({
  test: {
    browser: {
      screenshotDirectory: 'artifacts/screenshots',
      expect: {
        toMatchScreenshot: {
          screenshotDirectory: 'test/__screenshots__',
        },
      },
    },
  },
})
```

Antes, un `browser.screenshotDirectory` custom era usado incorrectamente por la
comparación de referencias. v5 hace la titularidad explícita: las capturas
transitorias/de navegador y las baselines de expectativa versionadas son clases
de artefacto diferentes. Mueve o regenera las baselines existentes después de
esta migración; no apuntes ambas clases silenciosamente al mismo directorio de
limpieza.

#10278 reduce el overhead de comparación de capturas. Su valor de rendimiento se
amplifica con el nuevo workflow de trazas/testeo visual: la comparación no debe
realizar trabajo caro repetidamente por cada candidato/reintento. No relaja la
semántica de comparación de píxeles.

## 3.7 Seguridad y frontera del provider

El puente de navegador expone capacidades reales de browser/CDP, filesystem y
comandos. v5 lo hace explícito:

* #10412 escapa los scripts inline del orquestador, cerrando un borde de
  inyección HTML/script.
* #10444 deshabilita la API CDP de cliente si `allowWrite` o `allowExec` es
  false.
* #10674 comprueba el acceso a filesystem en los comandos integrados, no solo
  en los entry points de UI.
* #10522 liga por sesión la ruta del orquestador; #10583 autentica por token la
  UI/API (capítulo 2).
* #10391 respeta `disableConsoleIntercept` en Browser Mode en lugar de conservar
  una interpretación del option solo para Node.

Para CI, concede al proceso de Browser Mode solo las rutas de
repositorio/artefacto que necesita. No añadas `allowWrite`/`allowExec`
permisivos solo para que un comando de test funcione; escribe un comando
dedicado con inputs estrechos y valida ahí el acceso a filesystem.

## 3.8 Grafo de Vite/módulos y correctitud del watch

El runner de navegador se basa en transformación Vite, así que la identidad del
módulo debe permanecer exacta. #10355 omite el transform `wrapDynamicImport` en
el entorno SSR, evitando que un comportamiento de wrapping orientado al
navegador corrompa la ruta de servidor. #9957/#10267 eliminan una ruta de
Playwright huérfana cuando el mismo módulo se mockea con múltiples identidades.
#10386 arregla el grafo de módulos expuesto a `--ui`; #10389 invalida source
maps obsoletos en modo watch. Los cuatro son versiones del mismo invariante: un
módulo mostrado, mockeado o recargado debe referirse a la misma identidad de
Vite que el que se ejecuta.

Si un fallo de Browser Mode se reproduce solo tras una edición de mock/rerun de
watch, inspecciona la URL resuelta (incluida la query), no solo la grafía del
import fuente. Prueba imports de query, aliases, IDs duplicados e imports
dinámicos en las suites de integración del provider.

## 3.9 Migración del provider: WebdriverIO

#10675 elimina el paquete de WebdriverIO integrado de Vitest y mueve el soporte
al proyecto comunitario `vitest-community/vitest-webdriverio`. Los arreglos de
beta anteriores siguen siendo históricamente relevantes: el resaltado de trazas
de Shadow DOM (#10227) y permitir GPU en Chrome headless (#10376) demuestran por
qué el comportamiento del provider debe probarse en la frontera del adaptador.
Migra el paquete, preserva la config específica del provider y mueve los issues
de soporte al proyecto comunitario. Playwright sigue siendo la ruta de provider
de primera parte considerada por el repositorio principal de Vitest.

## 3.10 Checklist de migración de Browser Mode

- No abras `/__vitest_test__/` manualmente; consume la URL de sesión generada.
- Actualiza los comandos custom de navegador para aceptar `SerializedLocator` y
  usar `.selector`.
- Audita las assertions de texto/query por coincidencias parciales accidentales;
  usa el matcher explícito de coincidencia donde la semántica parcial/regex sea
  intencional.
- Ejecuta los tests visuales con un directorio de baseline dedicado bajo
  `browser.expect.toMatchScreenshot`.
- Habilita trazas para triaje de fallos y añade fronteras `mark` semánticas
  escasas.
- Prueba el modo watch con aliases, imports de query, mocks e imports
  dinámicos.
- Valida el provider elegido contra Shadow DOM y las necesidades de
  headless/GPU; migra WebdriverIO a su paquete comunitario.
- Mantén estrechas las capacidades de UI/navegador (`allowWrite`, `allowExec`,
  rutas de filesystem) y nunca expongas URLs de token/sesión como endpoints
  estáticos públicos.

---

# 4. Mocking: transform, registro y ciclo de vida

El mocking de Vitest es una operación de transform Vite y de grafo de módulos,
no un reemplazo en runtime de los imports ESM ya evaluados. El plugin
`vitest:mocks` se ejecuta después de otros transforms, primero prueba
baratamente un patrón de llamada hoistable, luego parsea y reescribe los módulos
que contienen `vi.mock`, `vi.unmock` o `vi.hoisted`. Mueve esas llamadas antes
de los imports para que el registro preceda a la evaluación del módulo.
`vi.doMock` y `vi.doUnmock` se excluyen deliberadamente de esta regla de hoisting
porque son APIs de runtime.

## 4.1 El hoisting de nivel superior ahora se aplica (#10460)

v4 advertía sobre una llamada hoistable anidada en un callback; v5 lanza y lista
cada ubicación. La fuente anterior parecía ejecutarse condicionalmente, pero el
transform la ejecutaba en la evaluación del archivo, produciendo un orden de
ejecución engañoso.

```ts
// inválido en v5: el transform ejecutaría esto antes que el propio describe
describe('service', () => vi.mock('./transport'))

// válido: hoisting y ubicación de fuente coinciden
vi.mock('./transport')
describe('service', () => {})
```

Mueve el registro a nivel superior, usa un factory/`vi.hoisted` para el setup
computado, o usa `vi.doMock` cuando el test realmente necesite el timing de
runtime. #10410 evita por completo el trabajo de parseo y MagicString cuando la
recolección AST no encuentra ninguna llamada de mock: eso preserva la semántica
de transform correcta mientras elimina overhead en la ruta caliente.

## 4.2 Registro de navegador e identidad de módulo

Browser Mode serializa un registro de mock sobre la frontera
Node/orquestador/tester. #10192 corrige una pérdida semántica sutil: un
`automock` se deserializaba como `autospy`, así que sus exports reales seguían
ejecutándose. `MockerRegistry.register(serialized)` ahora crea un
`AutomockedModule` para `type: 'automock'`; `{ spy: true }` es la petición
explícita del comportamiento autospy.

```ts
vi.mock('./clock')                 // v5: stubs generados; sin ejecución real
vi.mock('./clock', { spy: true })  // comportamiento de export real rastreado, explícito
```

El registro indexa tanto la URL resuelta como el ID de módulo. Por eso
#9957/#10267 elimina una ruta de Playwright huérfana cuando módulos mockeados
equivalentes llegan por múltiples IDs, y por qué #10469/#10658 reparan los
imports de optimizer/query: la identidad del mock, la identidad de URL de Vite y
la resolución de módulo externo deben coincidir. #10489 añade `vite-plus/test`
al vocabulario de hoist import reconocido.

## 4.3 Stacks de helpers, limpieza y comportamiento condicional

#10415 preserva el callsite de `vi.defineHelper` a través de stacks de error
asíncronos; un mock helper debería informar de la ubicación fuente del test en
lugar de un frame de implementación. #10613 cambia el default de `clearMocks` a
`true`: antes de cada test Vitest ejecuta `vi.clearAllMocks()`, limpiando
calls/instances/contexts/results pero conservando las implementaciones de mock.
Las llamadas hechas en el ámbito de módulo o en `beforeAll` no están, por tanto,
disponibles para una assertion de test a menos que `clearMocks: false` se
configure deliberadamente.

#10174 añade `vi.when()`, una API declarativa de stubbing condicional.
Trátala como configuración de comportamiento de mock, no como mocking de
módulo: el registro de módulo sigue obedeciendo las restricciones de hoisting y
de grafo de módulos.

**Referencias:** [#10460](https://github.com/vitest-dev/vitest/pull/10460),
[#10410](https://github.com/vitest-dev/vitest/pull/10410),
[#10192](https://github.com/vitest-dev/vitest/pull/10192),
[#10469](https://github.com/vitest-dev/vitest/pull/10469),
[#10613](https://github.com/vitest-dev/vitest/pull/10613),
[#10174](https://github.com/vitest-dev/vitest/pull/10174).

# 5. Reporters, artefactos, snapshots y UI

Los reporters consumen el grafo de tareas reportado y normalizado descrito en
el capítulo 1. Los archivos blob son, por tanto, inputs de merge, no una captura
de consola opaca; HTML, JSON, JUnit, summary y UI son vistas/serializaciones del
mismo estado de ejecución.

## 5.1 Cambios en los reporters

`configDefaults.reporters` ahora expone los defaults integrados (#10219).
`logger.formatError` (#10268) centraliza el renderizado de errores. JUnit gana
opciones de naming compatibles con Jest-JUnit (#10189) e incluye errores no
manejados (#10244). Summary valida el `slowTestThreshold` no finito (#10202) e
intercepta streams de logger custom, no solo `process.stdout`/`stderr` (#10340).
JSON/JUnit tienen como default archivos `.vitest` (#10621), y HTML tiene como
default `.vitest` con semántica de directorio (#10620); #10235 proporciona la
forma explícita de archivo único.

Para la correctitud del merge, ver #10031 más #10318 (serialización de subpath
ausente), #10346 (nombres de archivo seguros para etiquetas), #10348
(`testModules` entre raíces), #10338 (metadatos de fuente HTML entre raíces) y
#10570/#10578 (timing de transform). Prueba los consumidores de informes contra
raíces de proyecto diferentes, no solo contra copias shardeadas de una raíz.

## 5.2 Snapshots y presentación

#9609 reemplaza `loupe.inspect` por `pretty-format`, afectando a los diffs de
assertion y a los valores interpolados en títulos parametrizados; #10170 elimina
las comillas de las variables de título `$` y el límite de truncado de títulos
es configurable. #10188 preserva un snapshot de cadena vacía. #10090 evita que
`test.fails` trate el uso de assertions de snapshot como un fallo esperado que
pasa. Los snapshots de DOM de traza de navegador (#10102) son artefactos de
traza, no archivos de snapshot de Jest; preservan el estado DOM inspeccionado
para diagnóstico de UI.

La migración de snapshots requiere revisar la serialización cambiada, no aceptar
masivamente cada actualización. Ejecuta con las versiones antigua y nueva, haz
diff de los archivos de snapshot y clasifica los cambios solo de formato frente
a los de valores/semántica DOM.

## 5.3 Correctitud de la UI

#10258 elimina errores coloreados duplicados; #10418 renderiza ANSI en el widget
inline del editor; #10386 corrige el grafo de módulos de Browser Mode; #10583
autentica la API de la UI. Juntos, hacen de la UI una proyección fiel y
controlada por acceso del estado de ejecución.

# 6. Cobertura y límites de proceso

La cobertura V8 es recolección en runtime mediante semánticas de inspector/CDP;
Istanbul es instrumentación. #9976 añade `coverage.autoAttachSubprocess`, solo
V8, que rastrea procesos hijos y threads de `node:child_process` y
`node:worker_threads` usando `NODE_V8_COVERAGE`. Es opt-in porque Node escribe
muchos archivos intermedios de cobertura: la visibilidad de subprocesos cuesta
I/O y overhead de arranque/runtime. Los tests cubren rutas de child/thread,
anidamiento, TypeScript, JavaScript y pre-transpiladas.

Las semánticas de los globs de cobertura se endurecen en #9818 y #10311: la
coincidencia es relativa a la raíz del proyecto en lugar de una contención laxa
de ruta absoluta, evitando coincidencias de raíces hermanas. #10299 evita que
`coverage.exclude` herede globs de negación de `test.include`. #10190 permite
objetos `thresholds.perFile`; los objetos de umbral glob deben declarar
explícitamente su propio comportamiento `perFile`. #10495 pasa el umbral previo
a `autoUpdate`. #10643 corrige offsets tras imports de módulo no esperados, y
#10466 falla rápido si ejecuciones concurrentes comparten `reportsDirectory`.

```ts
coverage: {
  provider: 'v8',
  autoAttachSubprocess: true,
  reportsDirectory: 'artifacts/coverage/unit',
  thresholds: { 'src/**': { lines: 90, perFile: true } },
}
```

Usa directorios de informe aislados por job concurrente y luego combina/informa
deliberadamente; revisa la salida de include/exclude cambiada tras el upgrade en
lugar de preservar coincidencias accidentales de ruta absoluta.

# 7. API de Expect, timers y API de benchmark

El capítulo 1 cubre la arquitectura del benchmark. Su migración pública es: el
`bench` de ámbito de módulo se convierte en un fixture de contexto de test;
`.run()` ejecuta un registro; `bench.compare()` intercala candidatos;
`writeResult` y `bench.from()` reemplazan el almacenamiento de comparación
implícito; los reporters estándar/JSON llevan los resultados; `Vitest.mode` es
siempre `'test'`. Usa retries y umbrales `delta` de los matchers de rendimiento
para entornos ruidosos.

Los cambios de expectativas son semánticos: #9643 restaura el comportamiento de
substring ordinario para que `toThrow('')` coincida con cualquier mensaje de
error (usa `/^$/` para un mensaje vacío); #10233 hace que `expect.poll` falle
cuando el callback o la assertion exceden la deadline y suministra un
`AbortSignal`; #10264/#10374 aceptan arrays/sets de solo lectura en `toBeOneOf`;
#10473 divide las assertions de texto de navegador estrictas y de coincidencia.
#10043 añade `fakeTimers.toNotFake`; #10654 actualiza fake-timers y falsifica
`Temporal` cuando está presente, salvo que esté explícitamente en `toNotFake`.

```ts
vi.useFakeTimers({ now: 0, toNotFake: ['Temporal'] })
await expect.poll(async ({ signal }) => fetch('/health', { signal }), { timeout: 1_000 })
  .toSatisfy(r => r.ok)
```

# 8. Catálogo de fiabilidad, diagnósticos y rendimiento

Los elementos restantes de la versión son pequeños en tamaño de diff pero
protegen fronteras críticas:

- #9870 modo build de TypeScript; #10449 unifica el typechecking y la
  recolección AST; #10461 deduplica su warning; #10467 corrige las columnas de
  tarea; #10651 permite `changed` en los tipos de config; #10681 deja de
  imprimir una columna en los nombres.
- #10363 aplica interop CJS para `__esModule` truthy; #10223 actualiza la config
  del optimizer; #10355/#10658 protegen la resolución de módulos
  transformada/codificada.
- #10265 elimina una fuga de listener de AbortSignal; #10543 evita un cuelgue de
  run al crashear un worker; #10587 mejora el texto de error de salida
  inesperada; #10608 espera `setImmediate` en la detección de async leaks;
  #10293 maneja con gracia el fallo de arranque del worker.
- #10308 preserva los timestamps mixtos de stdout/stderr; #10421/#10420 aplica
  los triggers de force-rerun de directorio a los archivos; #10327 escapa un
  ref name de publish-workflow.
- #10276 serializa los objetos de diff una vez; #10278 reduce el trabajo de
  comparación de capturas; #10446 reduce las asignaciones en rutas calientes.
  Ninguno cambia la correctitud visible para el usuario; haz benchmark antes de
  reclamar aceleraciones en tu workload.

# 9. Runbook de migración para repositorios grandes

1. Sube Node/Vite primero; fija una versión de Vitest en los proyectos del
   workspace.
2. Busca APIs/paquetes eliminados y `sequential`; migra los imports verificados
   por el compilador.
3. Haz explícitas las rutas de configuración; ejecuta cada script de paquete
   desde su CWD real.
4. Mueve la recolección de artefactos de CI a `.vitest`, directorios de
   cobertura únicos y archivos, en lugar de parsear stdout.
5. Ejecuta una matriz de Browser Mode: exactitud de locators/cambios de
   text-matcher, comandos custom serializados, Shadow DOM, capturas, watch/mocks
   y elección de provider.
6. Audita las llamadas de mock de ámbito de módulo, las suposiciones de
   automock, los imports de query/optimizer y las assertions de historial de
   mock afectadas por `clearMocks`.
7. Re-baselinea los snapshots solo después de revisar los cambios de
   pretty-format/título.
8. Valida los conjuntos de archivos de cobertura y la necesidad de subprocesos;
   mantén auto-attach apagado salvo que capture código que tu producto posea de
   verdad.
9. Ejecuta comprobaciones de merge-report y UI en artefactos de CI
   multi-raíz/multi-entorno.
10. Haz el rollout con un lockfile reproducible y conserva los
    artefactos/informes de v4 durante un ciclo de comparación; haz rollback de
    la versión del paquete, no de parches internos individuales.

# 10. Apéndices

## 10.1 Glosario

- **orchestrator:** página de Browser Mode ligada a sesión que crea/gestiona los
  iframes tester.
- **tester iframe:** contexto de ejecución de navegador real que importa los
  tests transformados por Vite.
- **provider:** adaptador de automatización que ejecuta los comandos
  privilegiados de navegador.
- **SerializedLocator:** formato de wire de locator transfronterizo
  `{ selector, locator }`.
- **reported task:** dato normalizado de test/suite/módulo consumido por
  reporters/UI/merger.
- **blob report:** dato de ejecución serializado para merge posterior, no un
  informe solo de visualización.
- **automock/autospy:** módulo stub generado frente a exports reales envueltos
  como spies.
- **artifact root:** directorio `.vitest` de nivel raíz para la salida generada
  de Vitest.

## 10.2 Mapa de referencias

El índice exhaustivo de notas de versión beta.1-beta.6 a PR/commit se mantiene
en [el registro de investigación (`VITEST_5_RESEARCH_LEDGER.md`)](./VITEST_5_RESEARCH_LEDGER.md).
La fuente primaria en el tag estudiado es
[vitest-dev/vitest v5.0.0-beta.6](https://github.com/vitest-dev/vitest/tree/v5.0.0-beta.6);
la justificación histórica principal de Browser Mode es
[Discussion #5828](https://github.com/vitest-dev/vitest/discussions/5828), y la
discusión de la API de benchmark enlazada por su PR es
[Discussion #7850](https://github.com/vitest-dev/vitest/discussions/7850).

---

**Capítulos completados:** 10 de 10.
