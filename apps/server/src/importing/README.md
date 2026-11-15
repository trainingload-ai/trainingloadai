# Import post-processing scheduling

Activity import completes in two stages: source normalization and light metrics,
then chronological analysis, fitness projections, PMC, and batch completion.
`UserPostProcessJob` rows retain each batch's durable identity and side effects.
The worker claims one ready request per user and combines the earliest affected
activity time and activity IDs of eligible same-user siblings.

## Coalescing and latency

The worker initially waits for a short quiet window and for known, analyzable
same-user import items to reach a terminal state. Later pending batch requests
extend the quiet window. The oldest ready request's maximum wait prevents a
continuous stream from indefinitely postponing its first analysis attempt.

Server process environment settings:

| Setting | Default | Meaning |
| --- | ---: | --- |
| `USER_POST_PROCESS_COALESCE_QUIET_MS` | 3000 | Quiet window before new analysis starts. |
| `USER_POST_PROCESS_COALESCE_MAX_WAIT_MS` | 15000 | Maximum coalescing wait from a ready request's creation. |

Values are integer milliseconds from 0 through 3600000; malformed values fall
back to the defaults. Setting maximum wait to 0 disables the initial coalescing
delay. These limits govern eligibility, not total queue time or execution time.

Expired leases, failed attempts whose retry time has arrived, resumed pages,
pending PMC work, and batches covered by a sibling replay bypass this additional
wait. They still respect retry availability, source ownership, and per-user
exclusion. UTC queue timestamps are compared explicitly against Prisma's
`timestamptz` parameters, independently of the database session timezone.

The maximum wait does not guarantee unchanged inputs during execution. Revision
checks still fence stale results. A typed evidence revision change gets up to
three durable short deferrals, tracked in `replayCheckpoint.evidenceDriftDeferrals`,
without incrementing the ordinary failure counter. The next revision failure
uses the existing bounded failure and backoff policy. Other failures keep their
existing classification. Deferrals preserve paging and pending PMC checkpoints.

## Durability and publication

When a canonical activity's DONE status makes its batch terminal, item status,
batch counters, and the durable post-process request commit in one transaction.
The batch row lock serializes simultaneous item completions and progress
refreshes. A failed enqueue rolls back item completion; lease fencing still
rejects a stale item owner. Other terminal paths retain their final progress
refresh.

A running replay only marks siblings captured by that replay as covered. New
requests remain separate durable rows, including requests for earlier activity
times. Each batch retains its own AI eligibility, export handling, and deduplicated
completion notification. A crash can repeat analysis; it cannot safely be
interpreted as permission to drop an unfinished source checkpoint.

Normal activity queries retain the existing READY filter. This scheduling change
does not expose partially analyzed activities or provide an atomic switch of all
of a user's derived results. Basic activity preview and versioned publication
require their own explicit product and storage design.

## Verification

`spec/user-post-process.coalescing.integration.spec.ts` exercises the actual queue
SQL and repository transactions with synthetic activities. It uses isolated
PGLite by default. When `CORE_MIGRATION_TEST_POSTGRES_URL` names an explicit
loopback PostgreSQL test service, it creates and removes a dedicated test
database and additionally checks competing schedulers and concurrent item
completion with separate database connections. Application `DATABASE_URL` is
never used for these tests.
