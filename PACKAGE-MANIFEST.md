# Current source package — background/offline revision, 20 November 2026

Complete source based on upload `c1293caa1302c779b589289b6ba590c2d43f6caa`, with approved BUG-021–024/BUG-007 changes and Hermes BUG-018–020 retained. Use `Musike_Background_Offline_20261120.patch` only against that exact baseline, or use the full source ZIP. The patch is also included in the ZIP for review; choose one installation method. Do not apply the historical patches below.

`BACKGROUND-OFFLINE-IMPACT.md` inventories changed files/functions. `BACKGROUND-OFFLINE-DOCUMENTATION-SYNC.md` supplies exact markdown snippets. `BACKGROUND-OFFLINE-HANDOFF.md` records behavior, checks and remaining real-device acceptance. `SOURCE-SHA256.json` covers every packaged source file except itself and this revision's generated patch (avoids recursion).

Dependencies, bundles, caches/DBs/runtime data, raw diagnostic attachments, credentials, `.git` and vendor SDK binaries are excluded. Uploaded source/operator examples are retained unchanged; this package does not deploy them. ZIP executable permissions match the uploaded archive.

---

# Current complete-source delivery — 19 November 2026

Source ZIP: `Musike_Web_PWA_Production_20261119.zip`; baseline upload `79958c4d54b9173ce2d80182973c6dce80e208be`. Complete source replacements are included. `EXPANDED-FIXES.patch` is the clean patch against that upload and includes retired-file deletions. `EXPANDED-IMPACT.md` lists affected files/functions; `EXPANDED-DOCUMENTATION-SYNC.md` contains exact current markdown snippets; `EXPANDED-HANDOFF.md` gives installation, validation and remaining acceptance.

`SOURCE-SHA256.json` is regenerated for the current tree, excluding itself and the newly generated patch to avoid recursion. Earlier patch files and manifest tables below are retained historical evidence and must not be reapplied after this revision. The current package excludes dependency directories, generated bundles, runtime data/caches, private vendor SDK files, credentials, .git and the raw diagnostic attachment.

Use a clean target checkout/directory or apply the patch. Unzipping over an old tree does not remove retired files. Preserve existing operator environment/compose/runtime files. The source Dockerfile change is limited to retired package COPYs and their comment; no production configuration was changed.

---

## Historical manifests (their hashes describe earlier deliveries)

# Targeted bugfix overlay manifest

Base: uploaded fork main `da3f88384651cdf8ee487054a50b0effb277cb45`. Date: 19 November 2026.

Extract directly into the existing fork repository root. Complete changed/new files are supplied. Alternatively apply BUGFIXES.patch against that base; do not apply both methods. Keep unchanged fork/operator files. The only approved deployment change is deploy/ytdlp-wrap.sh, supplied executable. No environment/compose/Dockerfile/DB/runtime/dependency/build output is included.

Payload: 47 replacements/new files below, plus this manifest and BUGFIXES.patch (49 ZIP entries). SHA-256 covers uncompressed bytes. The manifest omits its own hash and the patch hash to avoid a recursive hash dependency; the patch includes the manifest.

| Status | Path | SHA-256 |
| --- | --- | --- |
| Changed | ACCEPTANCE-CHECKLIST.md | d7addcec0acee9e0f50ca9b6ccc6a7526f330ea1a140527122afd8537819f948 |
| Changed | AGENTS.md | 2e0c9acc809761aa2adc38d30eac388a875ee9a060cacd8548dce11c15546a1c |
| Changed | ARCHITECTURE.md | fbbadef0c7ebc90e86ff9ef3d7de978b3649066e903d9f2fc7fe60bb1a45b3a2 |
| New | BUGFIX-IMPACT.md | 490d316d075aa5efeb4272b55c7e21e1f8c8d34be788c2f9e145713880fa5461 |
| Changed | CHANGELOG.md | d7c1592b2ad7aa8fe2929d20f3302e8bec0b1976f69a529d319ec2141fc85e30 |
| New | DEMO-VERIFICATION.md | e804ef42c39621546b028c482a00d33cc666d35070791e98360ae78acd568eec |
| Changed | DEPLOYMENT-NOTES.md | 994fd80bb3ea3b85c38f97c62d7453047363ca805e980b276048721fef32a3fd |
| New | DOCUMENTATION-SYNC.md | 020fa0caab3895666efcadcfdc031f4cb62b2bfd1133ded82a269d9d98bd7aba |
| Changed | HERMES_FOUND_BUGS.md | 03f799d2eb61a58b8c573f755fff1ec6ff0fce73e2dfc2a0bd6edc515938d536 |
| Changed | IMPLEMENTATION-PLAN.md | eb45d5326c0de286dc530e6a813b560b8e5543c0253fc1b40bbdf666a4ae780e |
| Changed | IMPLEMENTATION_SUMMARY.md | 4769ed02917edac5214fd5d12f0d2d5572bfbebb2c2d1f6601d8282c8693ff51 |
| Changed | PERFORMANCE_AUDIT.md | 340ca013a87459694bde2bdd91d9f4e38ae5129fc4198de3219ae92784a692c0 |
| Changed | TEST-RESULTS.md | e9253d5ec14f74fabfd577db364a6d0e4cdf7b1d6839e8922f357a2ec562cf7d |
| Changed | deploy/ytdlp-wrap.sh | 17c2c405dd327bd34a688472b0ce0d9a84e2d631a025f53d73de1b457e8695c2 |
| Changed | server/src/app.ts | 094bcfb98f2af689b25b72207baa11518445b117bd94c0641e7f57a4b4ff57f3 |
| Changed | server/src/audioCache.ts | 8b9508dc934411518f93a066d80aec24cee989b598a7c03cdc618c8a04c0e95f |
| Changed | server/src/directAudio.ts | 5df7e5aad2d18718ea72174b8e23ef643d5a4723c3aa5f065e187363d323fbfd |
| Changed | server/src/googleImport.ts | 99b1ae08b82f0ac25c01f215382f92af0255b0a44e4d0797f861d45cae0a8713 |
| Changed | server/src/googleSource.ts | b30c849269d9206b53013ce2e54a6b684ec851dfb56d567409dd493b8d604d83 |
| Changed | server/src/i18n.ts | 00acb3ae0e64de50861414278e5afcf62359031c2477922ec61cd62729dc68be |
| New | server/src/importMatching.ts | 0cc58b6c9ec79f36cdf47abceefd7b1dbdc5d1c2b5705199e7d84e8912f964ab |
| New | server/src/playbackDiagnostics.ts | cfcf70a4ade67c06e47d6657b74a9f6c79ba44c0e7a87b83c18cf5b91ac2a81b |
| Changed | server/src/process.ts | 1adc0207a1deff6ade3b8b528172bd676a7d1a0c8866cfe9db8e71cf3857105e |
| Changed | server/src/search.ts | 7f2c12266f33925baddfa0920537d4546cbf8ccfed1f8eb27db6f1dc3a302f6f |
| Changed | server/src/stream.ts | 5ddc263d0ab8dffc38ce9256c5d1ac3b54c7707017ab10ce1c19b69e9fd9cc1f |
| Changed | server/src/taskQueue.ts | 09d12603c5cb421d6942cc811277ba24d5f81df0ca3002157a480361f4ea9109 |
| Changed | server/src/ytdlp.ts | 1597d552520800d0f13bbed62db429cbe1e7b697cee3519c46c690376b178382 |
| Changed | server/test/accounts.test.ts | edc933a4687c68b26611866e03c70708fa624b0ab16ba01c2b335f66466eebc1 |
| Changed | server/test/audio-cache.test.ts | 4650baa992f81b44549544e1b8489859b4d88d148b46df45f9544c4236b6ecb1 |
| New | server/test/cold-audio.test.ts | f0fee360de363beb8b0abbb470a9a620336cf9b02f4c31c788b1b1d28272d143 |
| New | server/test/direct-client-cache.test.ts | 201ca4a23c4a35fd4608371f37612c1a3afd363ddec015d8d45b67f6d40dfaa7 |
| Changed | server/test/google-import.test.ts | d92dfa71312a6ea22304fc1829d03065edbc97d3639677b233d2010bbd9c590e |
| New | server/test/import-matching.test.ts | ac0d31fbc331ca130d8880a7c3489d72d5fb809e8f27db6ac0868494430da4df |
| New | server/test/playback-diagnostics.test.ts | 8885b25fe0ed8bad3d66b3dc931d2329cb6207c5b97d7af3678eb9cb0a61c5e0 |
| New | server/test/player-lifecycle.test.ts | e18e6d479d0e939f9feaeec4e2f0b30e6c610f4a0293269f7eac328ceb4b0eff |
| New | server/test/resolve-cancellation.test.ts | d6c9bdc69114cef17a5759c56143a808ac05f9d2b22b824b5d7357c791db6bcf |
| New | server/test/wrapper.test.ts | 22b71cde482ca7dbb63a464eae7f976f00441eb518942bce0b56564a3e98ccc8 |
| Changed | web/src/components/AccountPanel.tsx | 547b2e210f0a69db10b4ede14333a2d81c1182467fc68943fb6080986acb62ae |
| Changed | web/src/i18n/en.ts | 0d96ec0516bb248f891c08a75f21cbd163af2a8e2aca50d5fe1b167fddfccddb |
| Changed | web/src/lib/api.ts | 7447db29003b8b56d61c0c464067a386f1d4acfe762c79780d7ece59633cd40e |
| Changed | web/src/lib/apiTypes.ts | 17dba82a3d77faf1e0d8c01ad7ff82ccdea1a5235e9887e021450f51700dc34f |
| Changed | web/src/lib/audio.ts | 3163b3a8230c54cfaa5d04e562a10c448fcf63867e00d0cd5ff658efef5112a4 |
| New | web/src/lib/playbackDiagnostics.ts | 73b3d7d6487dda2745b4e8925c11033b207690784332a77de92cc45bbcef19ce |
| New | web/src/lib/playbackRecovery.ts | 456ec4a7fcf7dc517150ac89a9ca19b17e13dcebb0505b1ada6f78b0856288a5 |
| Changed | web/src/native/api.ts | 298e16c9850d6bb793976a3321ded8fbfd1e17829720382afb20cbdbb1c44e40 |
| Changed | web/src/player/player.ts | d235085a0f210dd75a42b9e65127d0cfbe8354062f2a7ed3d73aae91364da5d0 |
| Changed | web/src/stores/session.ts | 7d35c0252c6a1450b2eca9fec3da937b31dbb0a8f10b6bedb9efc9ee2228f785 |


## 19 November production revision — complete source delivery

The new Musike_Production_Fixes_Device_Sync_20261119.zip is a complete source tree, not the earlier overlay described above. It contains the original fork files plus approved changes, full replacement files, PRODUCTION-FIXES.patch, PRODUCTION-FIXES-IMPACT.md, updated documentation, a SHA-256 source manifest and the Hermes handoff/Cloudflare/removal instructions. It excludes .git, dependency directories, generated bundles, runtime databases/caches, SDK binaries/headers, credentials and the raw client diagnostic attachment. Platform folders remain intentionally until Hermes executes the separate removal runbook.
