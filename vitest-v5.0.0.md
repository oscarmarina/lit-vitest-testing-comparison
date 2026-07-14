Vitest Beta

# [**v5.0.0-beta.1**](https://github.com/vitest-dev/vitest/releases/tag/v5.0.0-beta.1)

   **Breaking Changes**

* Replace loupe.inspect with pretty-format  \-  by [**@hi-ogawa**](https://github.com/hi-ogawa), **Claude Sonnet 4.6** and **Codex** in [\#9609](https://github.com/vitest-dev/vitest/pull/9609) [(3f802)](https://github.com/vitest-dev/vitest/commit/3f802da4b)
* Remove quotes from string values in test.for/each title $ variable (take 2\)  \-  by [**@hi-ogawa**](https://github.com/hi-ogawa) in [\#10170](https://github.com/vitest-dev/vitest/pull/10170) [(04d37)](https://github.com/vitest-dev/vitest/commit/04d37e9d7)
* **browser**: Iframe scale  \-  by [**@macarie**](https://github.com/macarie) in [\#9745](https://github.com/vitest-dev/vitest/pull/9745) [(b6398)](https://github.com/vitest-dev/vitest/commit/b639852cc)
* **coverage**: include/exclude globs too eager  \-  by [**@AriPerkkio**](https://github.com/AriPerkkio) in [\#9818](https://github.com/vitest-dev/vitest/pull/9818) [(edacb)](https://github.com/vitest-dev/vitest/commit/edacb0fd4)
* **expect**: Fix toThrow("") behavior by reverting [\#6710](https://github.com/vitest-dev/vitest/pull/6710)  \-  by [**@hi-ogawa**](https://github.com/hi-ogawa) in [\#9643](https://github.com/vitest-dev/vitest/pull/9643) and [\#6710](https://github.com/vitest-dev/vitest/pull/6710) [(6c3e4)](https://github.com/vitest-dev/vitest/commit/6c3e4bdbf)

   **Features**

* Add createReport and .vitest report directory convention  \-  by [**@AriPerkkio**](https://github.com/AriPerkkio) in [\#9993](https://github.com/vitest-dev/vitest/pull/9993) [(72a6d)](https://github.com/vitest-dev/vitest/commit/72a6dc257)
* **browser**:
  * Export aria tree utils  \-  by [**@hi-ogawa**](https://github.com/hi-ogawa) in [\#10171](https://github.com/vitest-dev/vitest/pull/10171) [(c3423)](https://github.com/vitest-dev/vitest/commit/c3423014c)
  * Support dom snapshot trace view  \-  by [**@hi-ogawa**](https://github.com/hi-ogawa), **Claude Sonnet 4.6** and **Codex** in [\#10102](https://github.com/vitest-dev/vitest/pull/10102) [(7eddd)](https://github.com/vitest-dev/vitest/commit/7eddd273d)

   **Bug Fixes**

* **snapshot**: Fail test when snapshot assertion is used with test.fails  \-  by [**@hi-ogawa**](https://github.com/hi-ogawa) in [\#10090](https://github.com/vitest-dev/vitest/pull/10090) [(e1aa7)](https://github.com/vitest-dev/vitest/commit/e1aa7a60a)

    **[View changes on GitHub](https://github.com/vitest-dev/vitest/compare/v4.1.5...v5.0.0-beta.1)**

# [**v5.0.0-beta.2**](https://github.com/vitest-dev/vitest/releases/tag/v5.0.0-beta.2)

   **Breaking Changes**

* Default attachmentsDir from .vitest-attachements/ to .vitest/attachments/  \-  by [**@MdSadiqMd**](https://github.com/MdSadiqMd) in [\#10186](https://github.com/vitest-dev/vitest/pull/10186) [(1ba73)](https://github.com/vitest-dev/vitest/commit/1ba7338c3)
* Remove sequential test/suite options in favor of concurrent  \-  by [**@hi-ogawa**](https://github.com/hi-ogawa) and **Codex** in [\#10198](https://github.com/vitest-dev/vitest/pull/10198) [(9229f)](https://github.com/vitest-dev/vitest/commit/9229f2edc)
* Represent locator as an object instead of a string  \-  by [**@sheremet-va**](https://github.com/sheremet-va) in [\#10212](https://github.com/vitest-dev/vitest/pull/10212) [(80f07)](https://github.com/vitest-dev/vitest/commit/80f07edf6)
* Inline expect package  \-  by [**@sheremet-va**](https://github.com/sheremet-va) in [\#10221](https://github.com/vitest-dev/vitest/pull/10221) [(ad162)](https://github.com/vitest-dev/vitest/commit/ad16223e7)
* Remove deprecated entry points  \-  by [**@sheremet-va**](https://github.com/sheremet-va) in [\#10222](https://github.com/vitest-dev/vitest/pull/10222) [(994c6)](https://github.com/vitest-dev/vitest/commit/994c6ddb9)
* **mocker**: Deserialize automock as automock  \-  by [**@nami8824**](https://github.com/nami8824) in [\#10192](https://github.com/vitest-dev/vitest/pull/10192) [(2f892)](https://github.com/vitest-dev/vitest/commit/2f892712d)
* **reporters**: blob reporter and \--merge-reports default to .vitest/blob/  \-  by [**@AriPerkkio**](https://github.com/AriPerkkio) in [\#10232](https://github.com/vitest-dev/vitest/pull/10232) [(d22b0)](https://github.com/vitest-dev/vitest/commit/d22b029ae)

   **Features**

* Expose default reporters through configDefaults.reporters  \-  by [**@hi-ogawa**](https://github.com/hi-ogawa) and **Claude Sonnet 4.6** in [\#10219](https://github.com/vitest-dev/vitest/pull/10219) [(083f6)](https://github.com/vitest-dev/vitest/commit/083f6bdd6)
* Support merge reports for non-sharded multi-environment runs (take 2\)  \-  by [**@hi-ogawa**](https://github.com/hi-ogawa), **Claude Sonnet 4.6**, **Codex** and [**@AriPerkkio**](https://github.com/AriPerkkio) in [\#10031](https://github.com/vitest-dev/vitest/pull/10031) [(e60b2)](https://github.com/vitest-dev/vitest/commit/e60b2f49e)
* Add logger.formatError  \-  by [**@hi-ogawa**](https://github.com/hi-ogawa) and **Codex** in [\#10268](https://github.com/vitest-dev/vitest/pull/10268) [(2c5f3)](https://github.com/vitest-dev/vitest/commit/2c5f3ee2f)
* **browser**: Provide project reference in ToMatchScreenshotResolvePath  \-  by [**@macarie**](https://github.com/macarie) and [**@sheremet-va**](https://github.com/sheremet-va) in [\#10138](https://github.com/vitest-dev/vitest/pull/10138) [(16654)](https://github.com/vitest-dev/vitest/commit/166544e39)
* **coverage**: V8 to track node:child\_process and node:worker\_threads contexts  \-  by [**@AriPerkkio**](https://github.com/AriPerkkio) in [\#9976](https://github.com/vitest-dev/vitest/pull/9976) [(9baa5)](https://github.com/vitest-dev/vitest/commit/9baa5faba)
* **junit-reporter**: Add jest-junit-compatible naming options  \-  by [**@neumaennl**](https://github.com/neumaennl), **neumaennl**, [**@neumann4soft**](https://github.com/neumann4soft) and **Copilot** in [\#10189](https://github.com/vitest-dev/vitest/pull/10189) [(27393)](https://github.com/vitest-dev/vitest/commit/273933440)

 **Bug Fixes**

* Global sequence.concurrent: true with top-level test(..., { concurrent: false }) \+ depreacte sequential test API and options  \-  by [**@hi-ogawa**](https://github.com/hi-ogawa), **Codex** and [**@sheremet-va**](https://github.com/sheremet-va) in [\#10194](https://github.com/vitest-dev/vitest/pull/10194) [(9387f)](https://github.com/vitest-dev/vitest/commit/9387f57cf)
* Test tags options should overwrite inherited suite options \+ inherit suite options in task API  \-  by [**@hi-ogawa**](https://github.com/hi-ogawa) and **Codex** in [\#10216](https://github.com/vitest-dev/vitest/pull/10216) [(457db)](https://github.com/vitest-dev/vitest/commit/457db297b)
* Udpate optimize deps config  \-  by [**@sheremet-va**](https://github.com/sheremet-va) in [\#10223](https://github.com/vitest-dev/vitest/pull/10223) [(95dc6)](https://github.com/vitest-dev/vitest/commit/95dc6e3f1)
* **browser**:
  * Fix trace highlight of shadow dom on webdriverio  \-  by [**@hi-ogawa**](https://github.com/hi-ogawa) in [\#10227](https://github.com/vitest-dev/vitest/pull/10227) [(b01af)](https://github.com/vitest-dev/vitest/commit/b01afd26c)
* **deps**:
  * Update ivya to fix empty aria tree snapshot  \-  by [**@hi-ogawa**](https://github.com/hi-ogawa) in [\#10218](https://github.com/vitest-dev/vitest/pull/10218) [(f7822)](https://github.com/vitest-dev/vitest/commit/f7822ebf6)
* **runner**:
  * Propagate chainable flags in describe.for  \-  by [**@DORI2001**](https://github.com/DORI2001), **Dor Alagem** and [**@hi-ogawa**](https://github.com/hi-ogawa) in [\#10187](https://github.com/vitest-dev/vitest/pull/10187) [(db678)](https://github.com/vitest-dev/vitest/commit/db67831d7)
  * Limit concurrency per task branch in addition to per leaf callbacks  \-  by [**@hi-ogawa**](https://github.com/hi-ogawa) in [\#10179](https://github.com/vitest-dev/vitest/pull/10179) [(3112a)](https://github.com/vitest-dev/vitest/commit/3112abea2)
* **snapshot**:
  * Treat empty string as valid snapshot  \-  by [**@mayrang**](https://github.com/mayrang) and [**@hi-ogawa**](https://github.com/hi-ogawa) in [\#10188](https://github.com/vitest-dev/vitest/pull/10188) [(e145d)](https://github.com/vitest-dev/vitest/commit/e145d5756)
* **spy**:
  * Support private method spy types  \-  by [**@cyphercodes**](https://github.com/cyphercodes) in [\#10172](https://github.com/vitest-dev/vitest/issues/10172) and [\#10213](https://github.com/vitest-dev/vitest/pull/10213) [(628ab)](https://github.com/vitest-dev/vitest/commit/628ab32f1)

    **[View changes on GitHub](https://github.com/vitest-dev/vitest/compare/v5.0.0-beta.1...v5.0.0-beta.2)**

#

# [**v5.0.0-beta.3**](https://github.com/vitest-dev/vitest/releases/tag/v5.0.0-beta.3)

   **Breaking Changes**

* Require Node.js 22 and Vite 6.4  \-  by [**@sheremet-va**](https://github.com/sheremet-va) in [\#10178](https://github.com/vitest-dev/vitest/pull/10178) [(38762)](https://github.com/vitest-dev/vitest/commit/3876283e8)
* Fail expect.poll when function didn't resolve in time  \-  by [**@hi-ogawa**](https://github.com/hi-ogawa) and **Codex** in [\#10233](https://github.com/vitest-dev/vitest/pull/10233) [(4df04)](https://github.com/vitest-dev/vitest/commit/4df048c11)

   **Features**

* Support typescript build mode  \-  by [**@lishaduck**](https://github.com/lishaduck) in [\#9870](https://github.com/vitest-dev/vitest/pull/9870) [(106da)](https://github.com/vitest-dev/vitest/commit/106da5896)
* **api**:
  * Expose logs recorded during the test  \-  by [**@sheremet-va**](https://github.com/sheremet-va) in [\#10277](https://github.com/vitest-dev/vitest/pull/10277) [(cba20)](https://github.com/vitest-dev/vitest/commit/cba2036a1)
* **browser**:
  * Show aria tree on locator element error  \-  by [**@hi-ogawa**](https://github.com/hi-ogawa) and **Codex** in [\#10257](https://github.com/vitest-dev/vitest/pull/10257) [(04f04)](https://github.com/vitest-dev/vitest/commit/04f04cdd1)
  * Support custom kind in page.mark  \-  by [**@AriPerkkio**](https://github.com/AriPerkkio) in [\#10302](https://github.com/vitest-dev/vitest/pull/10302) [(053e8)](https://github.com/vitest-dev/vitest/commit/053e8b0d1)
  * Live update trace view on watch UI  \-  by [**@hi-ogawa**](https://github.com/hi-ogawa) and **Codex** in [\#10296](https://github.com/vitest-dev/vitest/pull/10296) [(78c11)](https://github.com/vitest-dev/vitest/commit/78c1169cf)
  * Add context.mark for custom command tracing  \-  by [**@AriPerkkio**](https://github.com/AriPerkkio) in [\#10329](https://github.com/vitest-dev/vitest/pull/10329) [(aa514)](https://github.com/vitest-dev/vitest/commit/aa5140e76)

   **Bug Fixes**

* Shell injection safety via github.ref\_name in publish workflow  \-  by [**@lloyd-c137**](https://github.com/lloyd-c137) and **lloyd-c137** in [\#10327](https://github.com/vitest-dev/vitest/pull/10327) [(dd020)](https://github.com/vitest-dev/vitest/commit/dd0207f4d)
* Make attachmentsDir root only config  \-  by [**@hi-ogawa**](https://github.com/hi-ogawa) and **Codex** in [\#10334](https://github.com/vitest-dev/vitest/pull/10334) [(fab1b)](https://github.com/vitest-dev/vitest/commit/fab1b6020)
* Apply cjs interop for truthy \_\_esModule  \-  by [**@hi-ogawa**](https://github.com/hi-ogawa) in [\#10363](https://github.com/vitest-dev/vitest/pull/10363) [(2b135)](https://github.com/vitest-dev/vitest/commit/2b13547a5)
* **browser**:
  * Simplify orchestrator otel carrier  \-  by [**@hi-ogawa**](https://github.com/hi-ogawa) in [\#10283](https://github.com/vitest-dev/vitest/pull/10283) [(3514f)](https://github.com/vitest-dev/vitest/commit/3514f9fa1)
  * Remove orphaned Playwright route when same module is mocked via multiple ids  \-  by [**@Zelys-DFKH**](https://github.com/Zelys-DFKH) in [\#9957](https://github.com/vitest-dev/vitest/issues/9957) and [\#10267](https://github.com/vitest-dev/vitest/pull/10267) [(41db6)](https://github.com/vitest-dev/vitest/commit/41db6ce28)
  * Skip wrapDynamicImport transform on ssr environment  \-  by [**@hi-ogawa**](https://github.com/hi-ogawa) in [\#10355](https://github.com/vitest-dev/vitest/pull/10355) [(d3c96)](https://github.com/vitest-dev/vitest/commit/d3c964bfc)
* **cli**:
  * Respect FORCE\_COLOR over agent detection  \-  by [**@dokson**](https://github.com/dokson) in [\#10272](https://github.com/vitest-dev/vitest/pull/10272) [(7e66b)](https://github.com/vitest-dev/vitest/commit/7e66bc726)
* **coverage**:
  * exclude to not inherit negation globs from test.include  \-  by [**@AriPerkkio**](https://github.com/AriPerkkio) in [\#10299](https://github.com/vitest-dev/vitest/pull/10299) [(28685)](https://github.com/vitest-dev/vitest/commit/286851ea2)
* **deps**:
  * Update fake-timers to 15.3.2. support toNotFake  \-  by [**@BPScott**](https://github.com/BPScott), [**@hi-ogawa**](https://github.com/hi-ogawa) and **Codex** in [\#10043](https://github.com/vitest-dev/vitest/pull/10043) [(bbf2f)](https://github.com/vitest-dev/vitest/commit/bbf2f0df3)
* **expect**:
  * Allow readonly arrays and sets in toBeOneOf  \-  by [**@YBJ0000**](https://github.com/YBJ0000) in [\#10264](https://github.com/vitest-dev/vitest/issues/10264) and [\#10374](https://github.com/vitest-dev/vitest/pull/10374) [(fed11)](https://github.com/vitest-dev/vitest/commit/fed1125b0)
* **junit**:
  * Include unhandled errors in JUnit XML report  \-  by [**@gbleu**](https://github.com/gbleu) and **Claude Sonnet 4.6** in [\#10244](https://github.com/vitest-dev/vitest/pull/10244) [(6f74e)](https://github.com/vitest-dev/vitest/commit/6f74e5e9d)
* **reporter**:
  * Guard against non-finite slowTestThreshold in summary reporter  \-  by [**@OfekDanny**](https://github.com/OfekDanny), **Ofek Danny**, **Claude Sonnet 4.6** and [**@AriPerkkio**](https://github.com/AriPerkkio) in [\#10202](https://github.com/vitest-dev/vitest/pull/10202) [(f362f)](https://github.com/vitest-dev/vitest/commit/f362f96db)
  * Fix non-existing import subpath module blob serialization  \-  by [**@hi-ogawa**](https://github.com/hi-ogawa) in [\#10318](https://github.com/vitest-dev/vitest/pull/10318) [(29cb0)](https://github.com/vitest-dev/vitest/commit/29cb06b35)
* **reporters**:
  * Fix blob file name with label  \-  by [**@hi-ogawa**](https://github.com/hi-ogawa) in [\#10346](https://github.com/vitest-dev/vitest/pull/10346) [(c5e2e)](https://github.com/vitest-dev/vitest/commit/c5e2e7530)
  * summary to intercept logger's streams even when they are not process.std\* streams  \-  by [**@AriPerkkio**](https://github.com/AriPerkkio) in [\#10340](https://github.com/vitest-dev/vitest/pull/10340) [(f79e7)](https://github.com/vitest-dev/vitest/commit/f79e7db90)
  * Fix missing testModules in onTestRunEnd when merging blobs from different root directory test runs  \-  by [**@hi-ogawa**](https://github.com/hi-ogawa) and **Codex** in [\#10348](https://github.com/vitest-dev/vitest/pull/10348) [(745b3)](https://github.com/vitest-dev/vitest/commit/745b30b64)
* **runner**:
  * Remove AbortSignal listener leak in withCancel  \-  by [**@tomohiro86**](https://github.com/tomohiro86) and [**@AriPerkkio**](https://github.com/AriPerkkio) in [\#10265](https://github.com/vitest-dev/vitest/pull/10265) [(ab098)](https://github.com/vitest-dev/vitest/commit/ab09822a4)
* **ui**:
  * Fix duplicate colored error message  \-  by [**@hi-ogawa**](https://github.com/hi-ogawa) and **Codex** in [\#10258](https://github.com/vitest-dev/vitest/pull/10258) [(035e3)](https://github.com/vitest-dev/vitest/commit/035e3bb70)
  * Fix missing source code in html reporter metadata when merging blobs with different root directory test runs  \-  by [**@hi-ogawa**](https://github.com/hi-ogawa) and **Codex** in [\#10338](https://github.com/vitest-dev/vitest/pull/10338) [(4f7c2)](https://github.com/vitest-dev/vitest/commit/4f7c2670c)

   **Performance**

* Stringify diff objects only once  \-  by [**@sheremet-va**](https://github.com/sheremet-va) in [\#10276](https://github.com/vitest-dev/vitest/pull/10276) [(d006a)](https://github.com/vitest-dev/vitest/commit/d006a6869)
* **browser**: Reduce matching screenshot overhead  \-  by [**@kasperpeulen**](https://github.com/kasperpeulen) in [\#10278](https://github.com/vitest-dev/vitest/pull/10278) [(511c0)](https://github.com/vitest-dev/vitest/commit/511c09269)

    **[View changes on GitHub](https://github.com/vitest-dev/vitest/compare/v5.0.0-beta.2...v5.0.0-beta.3)**

# [**v5.0.0-beta.4**](https://github.com/vitest-dev/vitest/releases/tag/v5.0.0-beta.4)

   **Breaking Changes**

* Throw an error if hoistable methods are outside the top level scope  \-  by [**@sheremet-va**](https://github.com/sheremet-va) in [\#10460](https://github.com/vitest-dev/vitest/pull/10460) [(d0b4f)](https://github.com/vitest-dev/vitest/commit/d0b4fddcb)
* toHaveTextContent is strict, add toMatchTextContent as alternative  \-  by [**@sheremet-va**](https://github.com/sheremet-va) in [\#10473](https://github.com/vitest-dev/vitest/pull/10473) [(18f30)](https://github.com/vitest-dev/vitest/commit/18f303079)
* **benchmark**: Rewrite the public API  \-  by [**@sheremet-va**](https://github.com/sheremet-va) in [\#10113](https://github.com/vitest-dev/vitest/pull/10113) [(19f6e)](https://github.com/vitest-dev/vitest/commit/19f6e8947)
* **browser**: Enable locators.exact by default  \-  by [**@sheremet-va**](https://github.com/sheremet-va) in [\#10430](https://github.com/vitest-dev/vitest/pull/10430) [(e2032)](https://github.com/vitest-dev/vitest/commit/e203202f9)

   **Features**

* **browser**: Show trace view steps in editor panel  \-  by [**@hi-ogawa**](https://github.com/hi-ogawa) and **Codex** in [\#10404](https://github.com/vitest-dev/vitest/pull/10404) [(8c4b6)](https://github.com/vitest-dev/vitest/commit/8c4b6da02)
* **reporter**: Support html reporter single file output  \-  by [**@hi-ogawa**](https://github.com/hi-ogawa), **Codex** and **Claude Opus 4.7 (1M context)** in [\#10235](https://github.com/vitest-dev/vitest/pull/10235) [(f757e)](https://github.com/vitest-dev/vitest/commit/f757ec5e6)

   **Bug Fixes**

* Preserve vi.defineHelper callsite for async error stack  \-  by [**@macayu17**](https://github.com/macayu17) and [**@hi-ogawa**](https://github.com/hi-ogawa) in [\#10415](https://github.com/vitest-dev/vitest/pull/10415) [(ac697)](https://github.com/vitest-dev/vitest/commit/ac6971ca2)
* Respect disableConsoleIntercept in browser mode  \-  by @Copilot, **hi-ogawa**, [**@hi-ogawa**](https://github.com/hi-ogawa) and **Codex** in [\#10391](https://github.com/vitest-dev/vitest/pull/10391) [(66110)](https://github.com/vitest-dev/vitest/commit/66110d271)
* ForceRerunTriggers uses directory globs against files  \-  by [**@Patrick-Clausen**](https://github.com/Patrick-Clausen) and **Patrick Clausen** in [\#10421](https://github.com/vitest-dev/vitest/issues/10421) and [\#10420](https://github.com/vitest-dev/vitest/pull/10420) [(4fee2)](https://github.com/vitest-dev/vitest/commit/4fee2e303)
* Unify typechecking and ast collection  \-  by [**@sheremet-va**](https://github.com/sheremet-va) in [\#10449](https://github.com/vitest-dev/vitest/pull/10449) [(af993)](https://github.com/vitest-dev/vitest/commit/af993b66b)
* Don't print typecheck warning more than once  \-  by [**@sheremet-va**](https://github.com/sheremet-va) in [\#10461](https://github.com/vitest-dev/vitest/pull/10461) [(15275)](https://github.com/vitest-dev/vitest/commit/152750ec0)
* Correct collumn when parsing tests  \-  by [**@sheremet-va**](https://github.com/sheremet-va) in [\#10467](https://github.com/vitest-dev/vitest/pull/10467) [(7c2fc)](https://github.com/vitest-dev/vitest/commit/7c2fc133e)
* **browser**:
  * Fix stale source map on watch mode  \-  by [**@hi-ogawa**](https://github.com/hi-ogawa) in [\#10389](https://github.com/vitest-dev/vitest/pull/10389) [(6d772)](https://github.com/vitest-dev/vitest/commit/6d772c800)
  * Escape inline orchestrator scripts  \-  by [**@hi-ogawa**](https://github.com/hi-ogawa) and **Codex** in [\#10412](https://github.com/vitest-dev/vitest/pull/10412) [(c22cf)](https://github.com/vitest-dev/vitest/commit/c22cfb656)
  * Disable client cdp API when allowWrite/allowExec: false  \-  by [**@hi-ogawa**](https://github.com/hi-ogawa) and **Codex** in [\#10444](https://github.com/vitest-dev/vitest/pull/10444) [(63e3b)](https://github.com/vitest-dev/vitest/commit/63e3b2eee)
* **mocker**:
  * Skip hoist transform without ast mock calls  \-  by [**@hi-ogawa**](https://github.com/hi-ogawa) and **Codex** in [\#10410](https://github.com/vitest-dev/vitest/pull/10410) [(0468e)](https://github.com/vitest-dev/vitest/commit/0468e1572)
* **ui**:
  * Fix module graph in browser mode with \--ui  \-  by [**@hi-ogawa**](https://github.com/hi-ogawa) in [\#10386](https://github.com/vitest-dev/vitest/pull/10386) [(3003c)](https://github.com/vitest-dev/vitest/commit/3003c4327)
  * Render ANSI color codes in editor panel inline error widget  \-  by @Copilot, **hi-ogawa** and [**@hi-ogawa**](https://github.com/hi-ogawa) in [\#10418](https://github.com/vitest-dev/vitest/pull/10418) [(766b8)](https://github.com/vitest-dev/vitest/commit/766b8d2fa)
* **webdriverio**:
  * Allow gpu in headless chrome  \-  by [**@rotempasharel1**](https://github.com/rotempasharel1) in [\#10376](https://github.com/vitest-dev/vitest/pull/10376) [(f310a)](https://github.com/vitest-dev/vitest/commit/f310abe4e)

   **Performance**

* Improve performance in hot paths  \-  by [**@sheremet-va**](https://github.com/sheremet-va) in [\#10446](https://github.com/vitest-dev/vitest/pull/10446) [(03faf)](https://github.com/vitest-dev/vitest/commit/03faf6db6)

    **[View changes on GitHub](https://github.com/vitest-dev/vitest/compare/v5.0.0-beta.3...v5.0.0-beta.4)**

# [**v5.0.0-beta.5**](https://github.com/vitest-dev/vitest/releases/tag/v5.0.0-beta.5)

   **Breaking Changes**

* Don't lookup config file from ancestor directories  \-  by [**@hi-ogawa**](https://github.com/hi-ogawa), **Codex** and **Hiroshi Ogawa** in [\#10428](https://github.com/vitest-dev/vitest/pull/10428) [(945d9)](https://github.com/vitest-dev/vitest/commit/945d9090e)
* Inline @vitest/runner package, do not publish it anymore  \-  by [**@sheremet-va**](https://github.com/sheremet-va) in [\#10511](https://github.com/vitest-dev/vitest/pull/10511) [(6d6e4)](https://github.com/vitest-dev/vitest/commit/6d6e46b1e)
* Allow mutating happy-dom/jsdom window object  \-  by [**@hi-ogawa**](https://github.com/hi-ogawa), **Hiroshi Ogawa** and **Codex** in [\#10373](https://github.com/vitest-dev/vitest/pull/10373) [(206e8)](https://github.com/vitest-dev/vitest/commit/206e8cff8)
* Expose concurrencyId/workerId on TestModule's diagnostics, make id 1-based  \-  by [**@sheremet-va**](https://github.com/sheremet-va) in [\#10516](https://github.com/vitest-dev/vitest/pull/10516) [(bdd98)](https://github.com/vitest-dev/vitest/commit/bdd985433)
* **browser**: Require sessionId for orchestrator html request  \-  by [**@hi-ogawa**](https://github.com/hi-ogawa), **Hiroshi Ogawa** and **Codex** in [\#10522](https://github.com/vitest-dev/vitest/pull/10522) [(79b7d)](https://github.com/vitest-dev/vitest/commit/79b7d8fcc)
* **coverage**: Allow thresholds.perFile to accept an object  \-  by [**@vladlenskiy**](https://github.com/vladlenskiy) and [**@AriPerkkio**](https://github.com/AriPerkkio) in [\#10190](https://github.com/vitest-dev/vitest/pull/10190) [(13b78)](https://github.com/vitest-dev/vitest/commit/13b78d98b)

   **Features**

* **browser**: Display nested mark trace in UI  \-  by [**@hi-ogawa**](https://github.com/hi-ogawa), **Hiroshi Ogawa** and **Codex** in [\#10437](https://github.com/vitest-dev/vitest/pull/10437) [(86ffc)](https://github.com/vitest-dev/vitest/commit/86ffc8ac6)
* **cli**: Add \--repeats CLI option  \-  by [**@todor-a**](https://github.com/todor-a) in [\#10504](https://github.com/vitest-dev/vitest/pull/10504) [(ee48b)](https://github.com/vitest-dev/vitest/commit/ee48b959e)
* **coverage**: thresholds.autoUpdate to receive previous threshold as argument  \-  by [**@wouterkroes**](https://github.com/wouterkroes) in [\#10495](https://github.com/vitest-dev/vitest/pull/10495) [(04f81)](https://github.com/vitest-dev/vitest/commit/04f81854f)

   **Bug Fixes**

* Fix mixed stdout/stderr log timestamps in onUserConsoleLog  \-  by @Copilot, **Hiroshi Ogawa**, [**@hi-ogawa**](https://github.com/hi-ogawa) and [**@sheremet-va**](https://github.com/sheremet-va) in [\#10308](https://github.com/vitest-dev/vitest/pull/10308) [(62756)](https://github.com/vitest-dev/vitest/commit/627565475)
* Fix importOriginal with optimizer and query import  \-  by [**@davidhwilliams**](https://github.com/davidhwilliams), **David Harris**, [**@hi-ogawa**](https://github.com/hi-ogawa), **Hiroshi Ogawa** and **Codex** in [\#10469](https://github.com/vitest-dev/vitest/pull/10469) [(6a3bb)](https://github.com/vitest-dev/vitest/commit/6a3bb02e0)
* Correct transform time calculation in merged report  \-  by [**@potatomatoooo**](https://github.com/potatomatoooo) and [**@hi-ogawa**](https://github.com/hi-ogawa) in [\#10570](https://github.com/vitest-dev/vitest/issues/10570) and [\#10578](https://github.com/vitest-dev/vitest/pull/10578) [(b7897)](https://github.com/vitest-dev/vitest/commit/b78972892)
* **browser**:
  * Wait for orchestrator readiness before resolving browser sessions  \-  by [**@soconnor-seeq**](https://github.com/soconnor-seeq) in [\#10397](https://github.com/vitest-dev/vitest/pull/10397) [(fe5ed)](https://github.com/vitest-dev/vitest/commit/fe5ed6bc7)
  * Wait for iframe tester readiness before preparing  \-  by [**@soconnor-seeq**](https://github.com/soconnor-seeq) in [\#10497](https://github.com/vitest-dev/vitest/pull/10497) [(f2655)](https://github.com/vitest-dev/vitest/commit/f26552c63)
  * Encode iframeId in tester iframe URL  \-  by [**@Pduhard**](https://github.com/Pduhard), **Pduhard** and **Claude Opus 4.8 (1M context)** in [\#10520](https://github.com/vitest-dev/vitest/issues/10520) and [\#10521](https://github.com/vitest-dev/vitest/pull/10521) [(c8bf1)](https://github.com/vitest-dev/vitest/commit/c8bf19f66)
* **coverage**:
  * Avoid matching sibling project roots  \-  by [**@innoprej**](https://github.com/innoprej), **Shin JaeHee** and [**@AriPerkkio**](https://github.com/AriPerkkio) in [\#10311](https://github.com/vitest-dev/vitest/pull/10311) [(e30dd)](https://github.com/vitest-dev/vitest/commit/e30dd9cf6)
* **mocker**:
  * Hoist vi.mock() for vite-plus/test imports  \-  by [**@Brooooooklyn**](https://github.com/Brooooooklyn) and **Claude Opus 4.8 (1M context)** in [\#10489](https://github.com/vitest-dev/vitest/pull/10489) [(88376)](https://github.com/vitest-dev/vitest/commit/8837664a4)
* **pool**:
  * Prevent test run hang on worker crash  \-  by [**@jaxalo**](https://github.com/jaxalo) and [**@AriPerkkio**](https://github.com/AriPerkkio) in [\#10543](https://github.com/vitest-dev/vitest/pull/10543) [(40878)](https://github.com/vitest-dev/vitest/commit/4087802b5)
* **vitest**:
  * Strip non-serializable functions from inline diff config  \-  by [**@DucMinhNe**](https://github.com/DucMinhNe) in [\#10573](https://github.com/vitest-dev/vitest/pull/10573) [(5b81a)](https://github.com/vitest-dev/vitest/commit/5b81a63ff)

    **[View changes on GitHub](https://github.com/vitest-dev/vitest/compare/v5.0.0-beta.4...v5.0.0-beta.5)**

# [**v5.0.0-beta.6**](https://github.com/vitest-dev/vitest/releases/tag/v5.0.0-beta.6)

   **Breaking Changes**

* Add screenshotDirectory config to browser.expect.toMatchScreenshot  \-  by [**@macarie**](https://github.com/macarie) in [\#10592](https://github.com/vitest-dev/vitest/pull/10592) [(a60de)](https://github.com/vitest-dev/vitest/commit/a60ded0fb)
* Update @sinonjs/fake-timers and support mocking Temporal  \-  by [**@hi-ogawa**](https://github.com/hi-ogawa), **Hiroshi Ogawa** and **OpenCode (claude-opus-4-8)** in [\#10654](https://github.com/vitest-dev/vitest/pull/10654) [(f8b15)](https://github.com/vitest-dev/vitest/commit/f8b1532fe)
* Remove webdriverio package  \-  by [**@sheremet-va**](https://github.com/sheremet-va) in [\#10675](https://github.com/vitest-dev/vitest/pull/10675) [(5fed6)](https://github.com/vitest-dev/vitest/commit/5fed68f72)
* Clear mocks by default before each test  \-  by [**@sheremet-va**](https://github.com/sheremet-va) in [\#10613](https://github.com/vitest-dev/vitest/pull/10613) [(0f646)](https://github.com/vitest-dev/vitest/commit/0f6463bf2)
* Don't emit localStorage warnings on Node 26, fail gracefully when worker fails to start  \-  by [**@sheremet-va**](https://github.com/sheremet-va) in [\#10293](https://github.com/vitest-dev/vitest/pull/10293) [(334ed)](https://github.com/vitest-dev/vitest/commit/334edef92)
* **reporters**:
  * Write json and junit reporter output files to .vitest by default  \-  by [**@hi-ogawa**](https://github.com/hi-ogawa), **Hiroshi Ogawa**, **OpenCode (claude-opus-4-8)** and [**@AriPerkkio**](https://github.com/AriPerkkio) in [\#10621](https://github.com/vitest-dev/vitest/pull/10621) [(58577)](https://github.com/vitest-dev/vitest/commit/58577290a)
* **ui**:
  * Harden UI API access  \-  by [**@hi-ogawa**](https://github.com/hi-ogawa), **Hiroshi Ogawa** and **Codex** in [\#10583](https://github.com/vitest-dev/vitest/pull/10583) [(4c26d)](https://github.com/vitest-dev/vitest/commit/4c26d7675)
  * Change html reporter default output to .vitest  \-  by [**@hi-ogawa**](https://github.com/hi-ogawa) and **Hiroshi Ogawa** in [\#10620](https://github.com/vitest-dev/vitest/pull/10620) [(29c36)](https://github.com/vitest-dev/vitest/commit/29c364d50)

   **Features**

* **vitest**: Create vi.when()  \-  by [**@macarie**](https://github.com/macarie) in [\#10174](https://github.com/vitest-dev/vitest/pull/10174) [(3900e)](https://github.com/vitest-dev/vitest/commit/3900e6349)

  **Bug Fixes**

* Fix setImmediate await in detect-async-leak  \-  by [**@hi-ogawa**](https://github.com/hi-ogawa) and **Hiroshi Ogawa** in [\#10608](https://github.com/vitest-dev/vitest/pull/10608) [(dd62b)](https://github.com/vitest-dev/vitest/commit/dd62b84e0)
* Fix per-project sequence config  \-  by [**@hi-ogawa**](https://github.com/hi-ogawa), **Hiroshi Ogawa** and **OpenCode (claude-opus-4-8)** in [\#10659](https://github.com/vitest-dev/vitest/pull/10659) [(40cdc)](https://github.com/vitest-dev/vitest/commit/40cdc7fd6)
* Add handshake timeout to iframe communication  \-  by [**@sheremet-va**](https://github.com/sheremet-va) in [\#10656](https://github.com/vitest-dev/vitest/pull/10656) [(3545f)](https://github.com/vitest-dev/vitest/commit/3545fe78f)
* Don't print column in test names when includeTaskLocation is enabled  \-  by [**@sheremet-va**](https://github.com/sheremet-va) in [\#10681](https://github.com/vitest-dev/vitest/pull/10681) [(bd9cc)](https://github.com/vitest-dev/vitest/commit/bd9cc9d8d)
* **browser**:
  * Always derive a positive locator action timeout  \-  by [**@sheremet-va**](https://github.com/sheremet-va) in [\#10626](https://github.com/vitest-dev/vitest/pull/10626) [(5b864)](https://github.com/vitest-dev/vitest/commit/5b8642120)
  * Resize the browser ui only if it's not headless  \-  by [**@sheremet-va**](https://github.com/sheremet-va) in [\#10662](https://github.com/vitest-dev/vitest/pull/10662) [(b5c61)](https://github.com/vitest-dev/vitest/commit/b5c613051)
  * Check fs access in builtin commands  \-  by [**@hi-ogawa**](https://github.com/hi-ogawa), **Hiroshi Ogawa** and **OpenCode (claude-opus-4-8)** in [\#10674](https://github.com/vitest-dev/vitest/pull/10674) [(33f96)](https://github.com/vitest-dev/vitest/commit/33f96a145)
* **coverage**:
  * Non-awaited module imports cause wrong offsets  \-  by [**@AriPerkkio**](https://github.com/AriPerkkio) in [\#10643](https://github.com/vitest-dev/vitest/pull/10643) [(c4090)](https://github.com/vitest-dev/vitest/commit/c40901479)
  * Fail fast when coverage.reportsDirectory conflicts between concurrent runs  \-  by [**@jgamaraalv**](https://github.com/jgamaraalv) and [**@AriPerkkio**](https://github.com/AriPerkkio) in [\#10466](https://github.com/vitest-dev/vitest/pull/10466) [(833f0)](https://github.com/vitest-dev/vitest/commit/833f0936c)
* **pool**:
  * Improve error message when worker exits unexpectedly  \-  by [**@filmaj**](https://github.com/filmaj) and [**@AriPerkkio**](https://github.com/AriPerkkio) in [\#10587](https://github.com/vitest-dev/vitest/pull/10587) [(76139)](https://github.com/vitest-dev/vitest/commit/76139c5a0)
* **types**:
  * Allow changed in configuration options  \-  by [**@AriPerkkio**](https://github.com/AriPerkkio) in [\#10651](https://github.com/vitest-dev/vitest/pull/10651) [(0da12)](https://github.com/vitest-dev/vitest/commit/0da12aad4)
* **vm**:
  * Fix external module resolve error with deps optimizer query for encoded URI  \-  by [**@SveLil**](https://github.com/SveLil) in [\#10658](https://github.com/vitest-dev/vitest/pull/10658) [(90c4e)](https://github.com/vitest-dev/vitest/commit/90c4ed4cd)

    **[View changes on GitHub](https://github.com/vitest-dev/vitest/compare/v5.0.0-beta.5...v5.0.0-beta.6)**
