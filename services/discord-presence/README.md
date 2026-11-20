> Current status, 19 November 2026: Hermes installed the missing system CA bundle (BUG-014), deployed it, and the user confirmed working Discord presence. This revision preserves that runtime fix and removes temporary SDK file logging. Numeric status/error/code fields are allowlisted on stdout. The live checks below are regression checks for this revised adapter, not a denial of the earlier confirmed result.

# Authenticated Discord presence service

This service is an **optional, unverified headless SDK deployment**, not a substitute for SDK/vendor acceptance. The source uses Discord's authenticated Social SDK connection (`UpdateToken` → `Connect` → Ready → `UpdateRichPresence`). It does not use desktop IPC, bot presence or an unofficial user token. The main app remains a web/PWA music player; this native SDK adapter is infrastructure, not a revived desktop/mobile product.

## Operator prerequisites

- A Discord application with Social SDK enabled and a supported use case. Verify that Discord permits this headless, multi-user music-service deployment. Published game/client examples do not certify it.
- Register the exact HTTPS callback `https://<music-host>/api/discord/callback` and obtain the application's ID/secret. Use the confidential server-side OAuth flow with `openid identify sdk.social_layer_presence`, PKCE S256 and owner-bound state.
- Download the official **Linux C++ SDK** through the Developer Portal. In a private build context beside this Dockerfile, provide `discord_social_sdk/include/` (including `discordpp.h` and its companion headers) and `discord_social_sdk/lib/release/libdiscord_partner_sdk.so`. Confirm library location/architecture against the actual SDK archive. Do not commit or ship the downloaded SDK in source ZIPs. Review redistribution requirements.
- Linux SDK support is experimental. Match the library architecture to the container host; do not publish a multi-architecture image from one vendor binary. Verify required runtime libraries with `ldd` before use. The default music image is unchanged.

## Build and configure

From the private `services/discord-presence` context run `docker build -t musike-discord-presence:<revision> .`. The build intentionally fails when vendor files are absent. Hermes must compile/run this against the actual SDK and record its version. No such vendor compilation was performed in the source workspace.

Propose a private sidecar/container to Azan using the operator's existing deployment mechanism. No public port, browser access or Discord token should be exposed. Both services need outbound HTTPS to Discord. Inject credentials using the operator's secret mechanism, not command-line literals or committed files.

| Variable | Location | Meaning |
| --- | --- | --- |
| DISCORD_CLIENT_ID | Music server | Discord application ID |
| DISCORD_CLIENT_SECRET | Music server only | Confidential OAuth client secret |
| DISCORD_REDIRECT_URI | Music server | Exact registered HTTPS callback; defaults to MUSIKE_PUBLIC_ORIGIN + /api/discord/callback |
| DISCORD_PRESENCE_URL | Music server | Private HTTP(S) origin for the service, e.g. http://discord-presence:8091 |
| DISCORD_PRESENCE_KEY | Both services | Matching random internal bearer secret, at least 32 characters |
| DISCORD_PRESENCE_MAX_USERS | Sidecar | Default 16 concurrent workers, bounded 1–64 |
| PORT | Sidecar | Default 8091 |
| DISCORD_SDK_WORKER | Sidecar | Default /app/discord-worker; testing override only |

Optional UI hides when configuration is absent. Unavailability must not stop playback, account login or library access. Users individually connect/disconnect in Account settings. `ready:false` is honest pending status, not a successful integration claim.

## Service boundary

The internal HTTP API requires the service bearer key on **every route**, including `GET /health`. `POST /presence` accepts a server-authenticated Musike user UUID, application ID, OAuth access token and `{title,artist,album,artwork,url,startedAt,endsAt}` or null (`album`, `url`, `endsAt` optional). `DELETE /presence/:user` closes that user's SDK worker. Input is capped at 16 KiB, connections at 64, native output at a bounded line buffer and workers at configured capacity. SDK processes receive credentials through private stdin, never argv. Raw native stderr/provider messages are suppressed. Allowlisted worker state/result events go to stdout. No application log files are configured.

Each user gets an isolated native SDK process. Tokens persist only encrypted in the main server's SQLite row using owner-bound AES-GCM; the service holds access tokens only in memory. The main server refreshes tokens and sends confirmed active-player state. The service expires unrenewed workers after 60–70 seconds; main-server stale state clears within 60–75 seconds. Browser close cannot be detected instantly after a network partition. Neither the server nor sidecar plays music.

The SDK enum `Listening` is requested; verify how Discord renders it for this application. Do not claim Spotify's privileged integration or identical visual features. Title/artist/artwork/timer are the acceptance fields. The worker sends start and end timestamps so Discord can draw a progress bar, sets the status display type to State so the member list shows the artist, links the title and cover to YouTube Music, and uses the album name as cover hover text. Status display type and field URLs need Social SDK 1.5 or newer. SDK/library failures must remain explicit.

## Required live proof

1. With no Discord desktop process/socket mounted on the host, link a real consenting test user and prove the SDK reaches Ready through authentication.
2. Observe actual profile title/artist and timer while playing in the PWA, including phone-only playback. Confirm pause clears presence.
3. Link a second test user, verify independent profiles and no identity/token crossover.
4. Exercise refresh, unavailable sidecar, capacity, logout/close, transfer, disconnect/revocation and restart.
5. Inspect container writable paths to verify the actual vendor SDK creates no log files. Test the optional service with a read-only root filesystem and a bounded private tmpfs if supported by the SDK; propose operator settings rather than editing existing compose files here.

If app eligibility, headers/binaries, headless authentication, presence semantics or SDK behavior blocks the proof, record the blocker and keep BUG-009 **runtime acceptance pending**. Do not silently fall back to another product behavior.

Primary references (checked 19 November 2026):
- https://docs.discord.com/developers/discord-social-sdk/getting-started/using-c%2B%2B
- https://docs.discord.com/developers/discord-social-sdk/development-guides/setting-rich-presence
- https://docs.discord.com/developers/discord-social-sdk/development-guides/account-linking-on-web
- https://docs.discord.com/developers/discord-social-sdk/core-concepts/oauth2-scopes
- https://docs.discord.com/developers/discord-social-sdk/core-concepts/platform-compatibility
