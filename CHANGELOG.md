# Changelog

## [1.6.1](https://github.com/iumalabs/flaretower/compare/v1.6.0...v1.6.1) (2026-08-13)


### Bug Fixes

* **a11y:** make FindingsTable's sort headers and row expansion keyboard-operable ([#372](https://github.com/iumalabs/flaretower/issues/372)) ([e16797c](https://github.com/iumalabs/flaretower/commit/e16797c9b19b17e5944b8e08316044cf6bcb4ee4))
* **app:** add an error boundary around the active page ([#373](https://github.com/iumalabs/flaretower/issues/373)) ([451da10](https://github.com/iumalabs/flaretower/commit/451da1029b941ce52281f2544b9a8cbb55f57e63))
* **audit:** reject a malformed since query param on GET /changes ([#374](https://github.com/iumalabs/flaretower/issues/374)) ([e6ef600](https://github.com/iumalabs/flaretower/commit/e6ef600b4bb757caf0c90068aa725a0a5ecf3571))
* **concurrency:** add an invocation-wide semaphore across all modules' cfFetch ([#371](https://github.com/iumalabs/flaretower/issues/371)) ([a510dae](https://github.com/iumalabs/flaretower/commit/a510daec1046022d1c389cd1f1001067a320c824))
* **storage:** avoid exceeding the 6-connection concurrency limit ([#370](https://github.com/iumalabs/flaretower/issues/370)) ([e5ef1f1](https://github.com/iumalabs/flaretower/commit/e5ef1f1524a0d2adcb309c365fea4e283c997da8))
* **workers-dashboard:** avoid exceeding the 6-connection concurrency limit ([#368](https://github.com/iumalabs/flaretower/issues/368)) ([3aa6f74](https://github.com/iumalabs/flaretower/commit/3aa6f74a92619421ee6574e3dc27090426e89437))

## [1.6.0](https://github.com/iumalabs/flaretower/compare/v1.5.0...v1.6.0) (2026-08-13)


### Features

* **identity:** audit operator role changes (spec 019) ([#360](https://github.com/iumalabs/flaretower/issues/360)) ([664869d](https://github.com/iumalabs/flaretower/commit/664869dfdfe0d9d701c6106259db1e31d353c5f5))


### Bug Fixes

* **audit:** register the 3 security checks migration 0013 added ([#362](https://github.com/iumalabs/flaretower/issues/362)) ([5898d2a](https://github.com/iumalabs/flaretower/commit/5898d2ad7bb136c38224dd27d124ce7241c36121))
* **dns:** reset FindingsTable's filter state on zone switch ([#363](https://github.com/iumalabs/flaretower/issues/363)) ([a240135](https://github.com/iumalabs/flaretower/commit/a240135af6185e23734386af6b534a976102a96f))

## [1.5.0](https://github.com/iumalabs/flaretower/compare/v1.4.0...v1.5.0) (2026-08-13)


### Features

* **access-dashboard:** add bespoke Access applications view (spec 014) ([#352](https://github.com/iumalabs/flaretower/issues/352)) ([07ca019](https://github.com/iumalabs/flaretower/commit/07ca019072422385804ba097f44877bcc3fa0e31))
* **audit-dashboard:** add real Audit log panel, reusing spec 012's integration (spec 018) ([#356](https://github.com/iumalabs/flaretower/issues/356)) ([5a9ffe8](https://github.com/iumalabs/flaretower/commit/5a9ffe88df80b675aadc1895d09e6a713334f8f5))
* **dns-dashboard:** add zone-tabbed DNS records view (spec 013) ([#350](https://github.com/iumalabs/flaretower/issues/350)) ([b2cac5a](https://github.com/iumalabs/flaretower/commit/b2cac5aef97a9e2939ef3dea97a88ae87bbd7194))
* **pages-dashboard:** add per-project Pages dashboard (spec 015) ([#353](https://github.com/iumalabs/flaretower/issues/353)) ([741f5af](https://github.com/iumalabs/flaretower/commit/741f5af6fca38e7fb471a9a4d1553ef9754d6218))
* **security-dashboard:** restructure zone checks, add 3 new checks + 2 live-fetched panels (spec 017) ([#355](https://github.com/iumalabs/flaretower/issues/355)) ([94785b4](https://github.com/iumalabs/flaretower/commit/94785b4face4e59cbedb7e560a9ed3bec3eb7555))
* **storage-dashboard:** add Bound-to/Custom-domain/Tables-Size columns (spec 016) ([#354](https://github.com/iumalabs/flaretower/issues/354)) ([ea32747](https://github.com/iumalabs/flaretower/commit/ea32747bd43067d611ec9f5aba60df129c75186e))

## [1.4.0](https://github.com/iumalabs/flaretower/compare/v1.3.0...v1.4.0) (2026-08-12)


### Features

* **workers-dashboard:** add Workers operational dashboard (spec 012) ([#346](https://github.com/iumalabs/flaretower/issues/346)) ([79eccac](https://github.com/iumalabs/flaretower/commit/79eccac52dcb6944e092b23c6887687289d4f7b6))


### Bug Fixes

* **deploy:** make deploy tasks self-sufficient, don't rely on Workers Builds' Build command ([#347](https://github.com/iumalabs/flaretower/issues/347)) ([5c36d4e](https://github.com/iumalabs/flaretower/commit/5c36d4e4cb7d0a00d639976a0a4c9040f42de106))

## [1.3.0](https://github.com/iumalabs/flaretower/compare/v1.2.0...v1.3.0) (2026-08-12)


### Features

* **design-system:** populate FindingsTable row detail on Exposure, add expand/collapse e2e coverage (T040/T041) ([#335](https://github.com/iumalabs/flaretower/issues/335)) ([b86940e](https://github.com/iumalabs/flaretower/commit/b86940e00a13db233d9d58789af6356773a4d538))


### Bug Fixes

* **dns:** guard total zone-list failure, add not_evaluated e2e coverage (T028/T029) ([#332](https://github.com/iumalabs/flaretower/issues/332)) ([0fb569b](https://github.com/iumalabs/flaretower/commit/0fb569b8eeeee4a9fc9d4a4b26f2f189d9f127c4))
* **token-tools:** distinguish deny from allow in checklist and comparison (T013/T014) ([#336](https://github.com/iumalabs/flaretower/issues/336)) ([cf4c0b2](https://github.com/iumalabs/flaretower/commit/cf4c0b230034c8e78396ed96fb35bf2f0b5d00a5))

## [1.2.0](https://github.com/iumalabs/flaretower/compare/v1.1.4...v1.2.0) (2026-08-12)


### Features

* **token-tools:** add Clone API Token Permissions page (T001-T008) ([#327](https://github.com/iumalabs/flaretower/issues/327)) ([e8fc795](https://github.com/iumalabs/flaretower/commit/e8fc7954d46ab604aa485d08aa4d25242a7ab9a1))

## [1.1.4](https://github.com/iumalabs/flaretower/compare/v1.1.3...v1.1.4) (2026-08-12)


### Bug Fixes

* **app:** use WORKERS_CI_BRANCH instead of git for release-build detection ([#322](https://github.com/iumalabs/flaretower/issues/322)) ([323ecf1](https://github.com/iumalabs/flaretower/commit/323ecf1f8dc9d965cb888e9d433a72ab13a01e29))

## [1.1.3](https://github.com/iumalabs/flaretower/compare/v1.1.2...v1.1.3) (2026-08-12)


### Bug Fixes

* **ci:** bring vite.config.ts, README.md, CLAUDE.md into fmt/lint/typecheck scope ([#319](https://github.com/iumalabs/flaretower/issues/319)) ([e9a97f4](https://github.com/iumalabs/flaretower/commit/e9a97f44257a60ad9cbeb57380502b0889a53459))

## [1.1.2](https://github.com/iumalabs/flaretower/compare/v1.1.1...v1.1.2) (2026-08-12)


### Bug Fixes

* **release:** drop unattended daily auto-merge, match sibling-project workflow ([#314](https://github.com/iumalabs/flaretower/issues/314)) ([cb58f06](https://github.com/iumalabs/flaretower/commit/cb58f06b0071b14928042c2be64dd63f3855cc4a))
* **release:** fold fast-forward into release-please.yml's own job outputs ([#317](https://github.com/iumalabs/flaretower/issues/317)) ([d5659f1](https://github.com/iumalabs/flaretower/commit/d5659f1e1ffac79c06268733a4f464c2ab0c20e6))

## [1.1.1](https://github.com/iumalabs/flaretower/compare/v1.1.0...v1.1.1) (2026-08-12)


### Bug Fixes

* **release:** fast-forward release branch on release:published, not merge-step ([#311](https://github.com/iumalabs/flaretower/issues/311)) ([70458cd](https://github.com/iumalabs/flaretower/commit/70458cda146f659af75c7f513cfd346635e4d817))

## [1.1.0](https://github.com/iumalabs/flaretower/compare/v1.0.0...v1.1.0) (2026-08-12)


### Features

* Audit & Drift Foundational phase — routing mount (T001) ([#251](https://github.com/iumalabs/flaretower/issues/251)) ([fdc70f6](https://github.com/iumalabs/flaretower/commit/fdc70f6bd689c741ee65386ab9ffd1c17a5cf5b9))
* Audit & Drift User Story 1 — unified alerts inbox (T002-T008) ([#252](https://github.com/iumalabs/flaretower/issues/252)) ([07ea367](https://github.com/iumalabs/flaretower/commit/07ea36768c3dc2717846d9c2ed4f5be37d93e55c))
* cross-module Overview page (Design System US3) ([#303](https://github.com/iumalabs/flaretower/issues/303)) ([0dfdeda](https://github.com/iumalabs/flaretower/commit/0dfdeda9915246ac4b620456e8c653770de1e9e4))
* DNS Foundational phase — D1 schema, routing mount (T001-T002) ([#87](https://github.com/iumalabs/flaretower/issues/87)) ([173de44](https://github.com/iumalabs/flaretower/commit/173de442b3ab7815ccd59454060a15e898d87108))
* DNS User Story 1 — full DNS inventory (T003-T010) ([#88](https://github.com/iumalabs/flaretower/issues/88)) ([9ea241f](https://github.com/iumalabs/flaretower/commit/9ea241fbc97cac099dd052a4c3be2fc27dbbcba8))
* DNS User Story 2 — dangling record critical flag (T011-T014) ([#89](https://github.com/iumalabs/flaretower/issues/89)) ([6543246](https://github.com/iumalabs/flaretower/commit/65432463cf517bb01d8839d4d49ce3c6bf5a9879))
* DNS User Story 3 — DNS-only exposure warning (T015-T017) ([#90](https://github.com/iumalabs/flaretower/issues/90)) ([6a1c551](https://github.com/iumalabs/flaretower/commit/6a1c551344ac8a1292a1707caa67b490a8a65485))
* DNS User Story 4 — scheduled drift alerting (T018-T022) ([#91](https://github.com/iumalabs/flaretower/issues/91)) ([a75bcd1](https://github.com/iumalabs/flaretower/commit/a75bcd11b93af9889a999c5eabf0ed770d8ce6b6))
* Foundational phase — Access JWT auth, D1 schema, routing skeleton (T005-T010) ([#50](https://github.com/iumalabs/flaretower/issues/50)) ([e77eab1](https://github.com/iumalabs/flaretower/commit/e77eab1e4d1aac9b89e0209a29887838cce43bc0))
* Identity & Authorization Foundational phase — routing mount (T001) ([#275](https://github.com/iumalabs/flaretower/issues/275)) ([56688ad](https://github.com/iumalabs/flaretower/commit/56688ad8cb63065e4c8e93a489dac60d6cf527be)), closes [#257](https://github.com/iumalabs/flaretower/issues/257)
* on-brand app shell — fonts, favicon, sidebar nav (Design System US1) ([#301](https://github.com/iumalabs/flaretower/issues/301)) ([c81c3e2](https://github.com/iumalabs/flaretower/commit/c81c3e2c3307ac16ac44d4faae7737a0c5ec0e41))
* Pages Foundational phase — D1 schema, routing mount (T001-T002) ([#156](https://github.com/iumalabs/flaretower/issues/156)) ([f8a0aa3](https://github.com/iumalabs/flaretower/commit/f8a0aa39c29f7786513f7aab75175618e128c9af))
* Pages User Story 1 — full inventory, custom domain status (T003-T010) ([#157](https://github.com/iumalabs/flaretower/issues/157)) ([733f445](https://github.com/iumalabs/flaretower/commit/733f4453d3a4968b55546a67c678b9e778f64a81))
* Pages User Story 2 — pages.dev exposure flag (T011-T014) ([#158](https://github.com/iumalabs/flaretower/issues/158)) ([1da8466](https://github.com/iumalabs/flaretower/commit/1da8466019af7bc75479b40d68b2c2d13757e621))
* Pages User Story 3 — production deployment health (T015-T018) ([#159](https://github.com/iumalabs/flaretower/issues/159)) ([af7658e](https://github.com/iumalabs/flaretower/commit/af7658e7a06546f718f2aeaeb92a498ff7de5df9))
* Pages User Story 4 — scheduled drift alerting (T019-T023) ([#160](https://github.com/iumalabs/flaretower/issues/160)) ([9175ec2](https://github.com/iumalabs/flaretower/commit/9175ec2cc0a48738629c1a9714302559edf8df3c))
* **release:** automated release-please versioning (T001-T003, T005-T009, T013-T015) ([#308](https://github.com/iumalabs/flaretower/issues/308)) ([f81c56b](https://github.com/iumalabs/flaretower/commit/f81c56b78ef03b8d603081e37ca6c672444ae54d))
* Security Posture Foundational phase — D1 schema, routing mount (T001-T002) ([#220](https://github.com/iumalabs/flaretower/issues/220)) ([b2ee62b](https://github.com/iumalabs/flaretower/commit/b2ee62baabadd63517bffaf7acf1bdc1f499e76a))
* Security Posture User Story 1 — full inventory (T003-T010) ([#221](https://github.com/iumalabs/flaretower/issues/221)) ([54d35f1](https://github.com/iumalabs/flaretower/commit/54d35f14675132246291afab060fe3ca9ef1bce9))
* Security Posture User Story 2 — SSL/TLS mode flag (T011-T013) ([#222](https://github.com/iumalabs/flaretower/issues/222)) ([41951f6](https://github.com/iumalabs/flaretower/commit/41951f62728d57065783436f8e3046cbc4803534))
* Security Posture User Story 3 — DNSSEC/WAF/rate-limiting gap flags (T014-T016) ([#223](https://github.com/iumalabs/flaretower/issues/223)) ([6684ffc](https://github.com/iumalabs/flaretower/commit/6684ffc90a614f14c7c8c57822b771730cdc97f9))
* Security Posture User Story 4 — scheduled drift alerting (T017-T021) ([#224](https://github.com/iumalabs/flaretower/issues/224)) ([692c719](https://github.com/iumalabs/flaretower/commit/692c7194c80937b34cc7588f69e57d6baba3b255))
* Storage Foundational phase — D1 schema, routing mount (T001-T002) ([#189](https://github.com/iumalabs/flaretower/issues/189)) ([864215b](https://github.com/iumalabs/flaretower/commit/864215b0116916c2ee3f40b3fc42b4b1963ad302))
* Storage User Story 1 — full inventory (T003-T010) ([#190](https://github.com/iumalabs/flaretower/issues/190)) ([2771940](https://github.com/iumalabs/flaretower/commit/2771940a724032a371c0c3fd90f9ec5eaa184570))
* Storage User Story 2 — R2 bucket exposure flag (T011-T014) ([#191](https://github.com/iumalabs/flaretower/issues/191)) ([9d6b569](https://github.com/iumalabs/flaretower/commit/9d6b56961b28784c4b62f946730915e38da0d1cc))
* Storage User Story 3 — KV/D1 unused-resource flag (T015-T018) ([#192](https://github.com/iumalabs/flaretower/issues/192)) ([6238aba](https://github.com/iumalabs/flaretower/commit/6238abab6b30a04a680d215a9c80f6caacae03e2))
* Storage User Story 4 — scheduled drift alerting (T019-T023) ([#193](https://github.com/iumalabs/flaretower/issues/193)) ([3ee9ec3](https://github.com/iumalabs/flaretower/commit/3ee9ec3fd1bede7754b671948940bf23ab6a3d0b))
* unified findings table across all 7 modules (Design System US2) ([#302](https://github.com/iumalabs/flaretower/issues/302)) ([264f2d6](https://github.com/iumalabs/flaretower/commit/264f2d61860123ac2f51fa21ee9e0b5a7ead8097))
* User Story 1 — full exposure inventory (T011-T018) ([#51](https://github.com/iumalabs/flaretower/issues/51)) ([4d5b10d](https://github.com/iumalabs/flaretower/commit/4d5b10d82e63e5e9882d9db948d41eb68a7f725c))
* User Story 2 — critical flag hardening + e2e coverage (T019-T022) ([#52](https://github.com/iumalabs/flaretower/issues/52)) ([a6ab9cc](https://github.com/iumalabs/flaretower/commit/a6ab9cc8f5bb7a1bc3f6dee2465afcaf0b47c010))
* User Story 3 — effectively-open Access policy warning (T023-T026) ([#53](https://github.com/iumalabs/flaretower/issues/53)) ([d1c10cf](https://github.com/iumalabs/flaretower/commit/d1c10cf453730ce3ebc0950f3f48aeeb7d250d1d))
* User Story 4 — scheduled drift alerting (T027-T032) ([#54](https://github.com/iumalabs/flaretower/issues/54)) ([878c42d](https://github.com/iumalabs/flaretower/commit/878c42d45583cbf58ff6e72cf892f8245b00b7dc))
* Zero Trust Foundational phase — D1 schema, routing mount (T001-T002) ([#123](https://github.com/iumalabs/flaretower/issues/123)) ([2cdfb57](https://github.com/iumalabs/flaretower/commit/2cdfb57265bc1eaa5f1e5297102a72bf55486aea))
* Zero Trust User Story 1 — full account-wide inventory (T003-T010) ([#124](https://github.com/iumalabs/flaretower/issues/124)) ([04c325e](https://github.com/iumalabs/flaretower/commit/04c325e645f3d465d2d2945f986de47a405e7a3b))
* Zero Trust User Story 2 — open policy flag account-wide (T011-T013) ([#125](https://github.com/iumalabs/flaretower/issues/125)) ([25edf3d](https://github.com/iumalabs/flaretower/commit/25edf3da413a15e88bc11691a1edb379477c6b47))
* Zero Trust User Story 3 — service token expiry (T014-T016) ([#126](https://github.com/iumalabs/flaretower/issues/126)) ([fed2096](https://github.com/iumalabs/flaretower/commit/fed2096f65053a8ebd42038fad20557d5f65f104))
* Zero Trust User Story 4 — scheduled drift alerting (T017-T021) ([#127](https://github.com/iumalabs/flaretower/issues/127)) ([9968a70](https://github.com/iumalabs/flaretower/commit/9968a707876b047a0be666157562aeef21a18357))


### Bug Fixes

* **audit:** distinguish a per-source D1 read failure from zero data (T025) ([#299](https://github.com/iumalabs/flaretower/issues/299)) ([6b45a1b](https://github.com/iumalabs/flaretower/commit/6b45a1b8c4af481ad67d68c056db9eff7260888b))
* collapse env.production/env.preview back to one Worker resource ([#284](https://github.com/iumalabs/flaretower/issues/284)) ([b700077](https://github.com/iumalabs/flaretower/commit/b700077c8578c171128c59ec33c6a8b66744b7a9))
* correct Security Insights endpoint path (missing security-center segment) ([#290](https://github.com/iumalabs/flaretower/issues/290)) ([32b4d71](https://github.com/iumalabs/flaretower/commit/32b4d718a10c6fc188eb5d49b886aa374c6df36c))
* decouple Zero Trust inventory from zt_app_findings, add run-completion marker ([#297](https://github.com/iumalabs/flaretower/issues/297)) ([83e1504](https://github.com/iumalabs/flaretower/commit/83e1504a50840d34562af0cbe96cc2fc2bdac253))
* don't silently omit zero-record zones from GET /dns/inventory ([#295](https://github.com/iumalabs/flaretower/issues/295)) ([113277b](https://github.com/iumalabs/flaretower/commit/113277b1bdb09a02a12f3d5249970a77e514153c))
* **exposure:** degrade buildWorkerInventory to sentinel findings on API failure (T037-T039) ([#296](https://github.com/iumalabs/flaretower/issues/296)) ([5e18161](https://github.com/iumalabs/flaretower/commit/5e181617d7b6f631fd9a0723799f19e2b64c4f65))
* R2 buckets list API returns {buckets: [...]}, not a bare array ([#287](https://github.com/iumalabs/flaretower/issues/287)) ([d52c29f](https://github.com/iumalabs/flaretower/commit/d52c29f49de2c6fc7648129588c8c14ddaa29bb0))
* Security Insights response shape and insight-to-record matching ([#291](https://github.com/iumalabs/flaretower/issues/291)) ([1d6ce83](https://github.com/iumalabs/flaretower/commit/1d6ce832b75a9347755b222fb015ed6a97d5c67a))
* **security:** preserve Turnstile not-evaluated signal, fix empty-state check (T025, T026) ([#298](https://github.com/iumalabs/flaretower/issues/298)) ([38612bf](https://github.com/iumalabs/flaretower/commit/38612bf5757b65b0d122ca5b5bcac7efcc8bf530))
* surface Cloudflare's own error detail on API failures, all modules ([#289](https://github.com/iumalabs/flaretower/issues/289)) ([d6ce6c8](https://github.com/iumalabs/flaretower/commit/d6ce6c8d1e1133aa5f72c1b1abae948ae8204a7c))
