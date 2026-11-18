# Database decision

**Recommendation: SQLite WAL in the existing Musike container, with all SQL in a dedicated worker thread.** This fits the stated private family instance: fewer than 20 users, light writes, one NAS, file-based backups and an existing persistent data directory. No second database service or compose change is needed.

| Criterion | SQLite WAL, implemented | Separate PostgreSQL service, evaluated |
| --- | --- | --- |
| Operations | Built into supported Node; one data directory and secret | Additional service, credentials, health checks, upgrades and backup procedure |
| Concurrency | Concurrent readers with one writer; short serialized transactions fit the workload | Multiple concurrent writers, row-level locking and better headroom for larger/multi-instance workloads |
| App event loop | Synchronous SQLite API is confined to a worker; handlers await RPC | Network client API would also be asynchronous; needs a new dependency/connection pool |
| Backups | Stop service and copy consistent data directory, or use SQLite backup API | Prefer consistent PostgreSQL backups/snapshots; not an arbitrary live database-directory copy |
| Storage | WAL requires shared memory on the same host; use a local filesystem | A database service exposes a network protocol; storage still needs suitable persistence |
| Growth | Good fit for this single-process family deployment | Better choice for multiple app replicas, heavy concurrent writes, more complex normalized querying/operations |
| Costs/limits | One writer, in-process library cache, whole-library JSON snapshots; not a distributed store | More operational burden than this workload currently warrants; migrating later needs an explicit implementation |

The SQL schema stores users, sessions, OTPs, invites/approval state, persisted settings, audit/presence, encrypted Google credentials and import mappings. Each user has an isolated JSON library row keyed by a foreign key. This deliberately retains the existing shared/native library domain and backup API. It does not invent relational track/playlist tables or pretend that in-memory track filtering is indexed SQL. Import mappings are indexed separately and loaded once per run, with batched inserts after durable library writes.

Transactions provide atomic ownership migration, role/bootstrap changes and grouped writes. SQLite FULL synchronous mode, foreign keys and a five-second busy timeout are set in the worker. Native standalone builds remain JSON-based. Node 22.13+ is required. PostgreSQL would require a client dependency, schema/storage adapter and a separately provisioned service; none is included or required in this ZIP.

Reconsider PostgreSQL when the app needs multiple replicas, background workers in other processes that mutate libraries, sustained write contention or richer relational analytics. A SQLite file alone does not make the current cached-library design safe for multiple application writers. The CLI only changes users/roles; it must not edit library snapshots while another process owns them.

Primary references: [SQLite WAL](https://sqlite.org/wal.html), [SQLite isolation](https://sqlite.org/isolation.html), [SQLite online backup API](https://sqlite.org/backup.html), [Node 22 SQLite API](https://nodejs.org/docs/latest-v22.x/api/sqlite.html), [PostgreSQL concurrency control](https://www.postgresql.org/docs/current/mvcc.html). The actual schema is in `server/src/db.ts` and is documented in `ARCHITECTURE.md`.
