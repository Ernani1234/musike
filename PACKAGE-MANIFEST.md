# Source overlay manifest

Base: Azan-Shah/musike main `85843fd42020dbf47831ec97d268981ec0f434d9`.

Extract the ZIP **directly into the fork repository root**, keeping all unchanged fork files. This is not a complete standalone checkout. Every listed file is a complete final file; no patch application is required. Operator-owned environment/compose/deployment files are absent and unchanged. No dependencies, build outputs or runtime data are included. Read DEPLOYMENT-NOTES.md before enabling auth/import.

Payload: 55 changed/new files below plus this manifest (56 ZIP entries). SHA-256 values cover the uncompressed bytes. The manifest does not hash itself.

| Status | Path | SHA-256 |
| --- | --- | --- |
| New | ACCEPTANCE-CHECKLIST.md | 2427f30e96a26dbd57db86152a922a66fb7c487ef8e8d5ded3c7dbe33bce6d0d |
| New | AGENTS.md | 401385e78eb10b2d26daf167403cb4888511836359ab43fada6e4b49f5897946 |
| Changed | ARCHITECTURE.md | 4cd26b477f0475786f868e0603f963213083398bf22cfe5a89a296e9bb0d5638 |
| New | CHANGELOG.md | 9660195d76773cc4476391ce3f095ecd838ce10b559a975b196020e71f492b05 |
| New | DATABASE-DECISION.md | 4f30fe49dfc2c5cb49b87977f56dfcd1899b71543b5bcdac1054055dd00fd02e |
| New | DEPLOYMENT-NOTES.md | 796daeb4b75d4be7a15a081e89d9ecb84bcb8cd33eea97d958f36af8d3cfee3e |
| Changed | HERMES_FOUND_BUGS.md | 30d61d40654a36b1c516acb2fe25ad9ec47facda2e2ffa683e18c0e7b5528c1b |
| New | IMPLEMENTATION-PLAN.md | 4c2a959ea79af0e834cbd5f3a540728780f6a322a69ea1ca2011a07bab579041 |
| Changed | IMPLEMENTATION_SUMMARY.md | 7db59409a4f4d9ee7417b20c611e10a2cbb6271fe7d6097e3a1446526ff07853 |
| Changed | PERFORMANCE_AUDIT.md | d7f5544c85dabb96c8d2bfe5ace16f65c7cd016b125cd5a629a5d7891639224f |
| Changed | README.md | e5c455736785ba9f2eeb037ec6a19d8b15e4e32c6df63ff8a6013c58a2f3b37d |
| New | TEST-RESULTS.md | 143fca9cbd8d2932ee8adcf2c7135278ee93549fc859c4c7077bdb0805b73ec6 |
| Changed | server/package.json | 07b151ce5ea049047c2bba9f6cb2caa92a136840037d2f94d5f65c985b78c1d1 |
| New | server/src/accountRoutes.ts | 63f12fcb781c4aa000c2dd3aabb070ed56a6cadebc2bdbc9af2224f8556a7a15 |
| New | server/src/accounts.ts | ab2bf6db422e0f3f963f74c2904d09013a3ee23308c1b5111a6da0fa62170215 |
| New | server/src/adminRoutes.ts | 58f15a31a7cd57d35f561b6e9a3b57fc2231729ba0406985fc508f69bb6d00ca |
| Changed | server/src/app.ts | 5cdf66fde3930a2cea4b971cd1080e8ca07d008feba8256ea7a31645a7925313 |
| New | server/src/audioCache.ts | 66574e7a6b3447fef460937022d8386425bba9e82c7ddd9c36c773e1be3f1498 |
| New | server/src/cacheBudget.ts | e1d3a3daf48aa8f05adaf99233a730bc96c5a584d8d63a020fdebc25d8da658e |
| Changed | server/src/config.ts | 4ec48c736ee319ee679797d894473127ec5dce8244a8233d14868ab99f6d7667 |
| New | server/src/db.ts | af9a1138126830b2f60bea25fc000462184b14d9d73db218aa0984271f6282f5 |
| New | server/src/googleImport.ts | 20c925e86b859908da2fd3d4981fffcb7eba475f67d62fdde9a66b63576f8b45 |
| New | server/src/googleSource.ts | d3f5bbae98aa7aec1507fbc1a0ef5e7dd7e820eaffc498ecc0bf172fcdffcc21 |
| Changed | server/src/index.ts | 5688d55d0cb3afedce9e22c82e3d31018f9658bb10281953a26e07cd9db4aa9c |
| Changed | server/src/library.ts | 1fd3e110eeeee78d5f87b34c4fffac86c672d1267c80861ba4fc4be6704ef2dd |
| New | server/src/promote.ts | 2d3ae368fa89ef4724fea38f496ff96f2c93fe0df5dd61e577a4cbcb5ec3fe64 |
| New | server/src/proxy.ts | ae254e68a24a4f64cc664906b887257c7e2e6e52e04a4110074d5fe66f955b60 |
| New | server/src/secret.ts | 38b1cf60db34ba756880b7854eab681a84de3f223b30bb1d6ba5d19fd519480e |
| Changed | server/src/taskQueue.ts | 39502dab3f2984efff514f0fb1d36b729ae0906c2c1af7abe803eccbd355687f |
| Changed | server/src/types.ts | 28dec377e43eb0fe6ce26d29cd1b09e9993ce2b202615c56241ad8318442e17c |
| Changed | server/src/ytdlp.ts | ee9c20503a08b73f9692d96cb33468601998baa3db35174f3f3aab0b395b13b9 |
| New | server/test/accounts.test.ts | a7718aed4c964488161012bba4a441db165e8749637d772298057723885ba4cb |
| New | server/test/admin.test.ts | eb9805d463939dbed4131d99370df9f2413bd5b5daabcac134e44df92fae9f51 |
| New | server/test/audio-cache.test.ts | 069ba7ae8aaf03208c19a60e5b794eb102d7580b57d3c796b5f2f81e3cf78bca |
| New | server/test/google-import.test.ts | ee19638798499679653282468d80e5bea2e28d0c638d604456387447d4d83663 |
| New | server/test/playback-queue.test.ts | 07b5d69f2533dfd3e8f1e69ff18687fff3769df2d5fbd95dd16dcffa49680ac9 |
| Changed | web/src/App.tsx | 7c3521dd1c02b81416b006fef7e9ac48096e23b4ccec16bc0dc815b24b047995 |
| New | web/src/components/AccountPanel.tsx | 244b2407f35e5b9c1bfac047ff159f75acdb855699a3d9ae6f8a96cb11e5d138 |
| New | web/src/components/AdminPanel.tsx | 2b596ecbd705d27744eaa1a3d6ed58516e1cb09a0e655174ca9c12671d7c5e69 |
| New | web/src/components/AuthGate.tsx | d2b763a337227b32aeb9df9f68dd9d65d33ed9e882a32325f676c66059226605 |
| Changed | web/src/components/SettingsDialog.tsx | 57064429eeb9fbd07d906f5b746bfbe5c70cac4d06ee3158d4ddb9421863a777 |
| Changed | web/src/components/TrackMenu.tsx | 0fe8eee985c3264ce1eb71fca986518f3b1b045d35675335d56c99400f319e9e |
| Changed | web/src/i18n/en.ts | 75f00304816e6f3e4c2c4a13e536ef613420e99d3fbd1be0d96e9c81dccabb4b |
| Changed | web/src/i18n/pt.ts | 98c5ab9cbff1ce2301e10a87f59f83abbfb5cdd49f264149d98c798cbadc1ad4 |
| Changed | web/src/lib/api.ts | 5a970fd4342bb0e8b1cc012f0984cf7dd0fcb19fb12ec4448887a3136ffaceaf |
| Changed | web/src/lib/apiTypes.ts | 04c2c6b8079259e537f048ee7e9e80cab0adc6b3a53b0c67f7dd573855a9e903 |
| Changed | web/src/lib/audio.ts | 5eab56fcb8d6b0a9e4b0b853ab04117d0fc44c1a3bd3a479532b7c3197095e0c |
| New | web/src/lib/playbackQueue.ts | f52922b26de43d3740b3aafd43b3cbf3c2f7124080849a40e5e9b98e6ae72a0a |
| Changed | web/src/lib/types.ts | 5f6c77faa78bc446dad566b59129275c152953df9d7f8364526201c3829ce6e3 |
| Changed | web/src/main.tsx | 16dc80ae8843db501083793159b1b352bef42d72719e9d03c0644893db1aa687 |
| Changed | web/src/native/api.ts | fa70727532b3075346eaa8b3ba916db3c73f07ccb4434968590ba366bd1b0262 |
| Changed | web/src/player/player.ts | 2ff9b86658a25c54692ef40a11dfcdeefefbe5a26d23de8db0cc5b9713ac3ab6 |
| New | web/src/stores/session.ts | 4af7be24a237df7a7795fbabb884f460e250d74ce938f5b53f602e821c01ca8a |
| Changed | web/src/views/Collection.tsx | ffdb3c0ca1bc645bf0a5254f064c8500f49db38bf6eac4e578bc661f3fef5122 |
| Changed | web/src/views/Library.tsx | 9ae0b22b94f06eeb376811de801402ded32afaadb15318dc921fd662f167c89d |
