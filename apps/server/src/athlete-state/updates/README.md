# Athlete State updates

Fact writers request an update after a relevant adopted fact changes. The shared
runner owns evidence assembly, assessment and Case progression. Webhooks never
call the model inline.

`AthleteStateUpdates.requestUpdate({ userId, triggerType, triggerRef, mode })`
defaults to `queued`. Ordinary requests share a 20-minute window measured from the
first pending request; subsequent requests do not postpone it.
`ATHLETE_STATE_UPDATE_DELAY_MS` overrides that window in milliseconds. The default
is `1200000`. Immediate requests promote the same durable job and try the same
runner; saturation or another valid lease leaves the request pending.

Pass the transaction client when requesting an update alongside a fact write.
No model work or wake notification runs before that transaction commits. Polling
recovers committed work even if a wake notification is lost. Queue writes use
absolute timestamps; health scope uses the account's local calendar day.

The database-only queue module owns one row per user, versions and leases.
Eligibility lives outside that module and checks the independent
`ATHLETE_STATE_AUTO_ENABLED` preference (unset means enabled), data consent and
feature access before enqueueing and again before reading evidence. Explicit
Case answers bypass only the automatic preference. Expected refusals are skips.

Health triggers are adopted changes to sleep duration/score, rMSSD, SDNN and
VO₂max inside the current evidence window. Standalone weight, steps and resting
heart rate remain passive facts. Effective FTP/VO₂max settings, completed activity
processing, changed PMC, Review and independent Memory changes share the queue.
Maintenance replay preserves its suppression policy. Case references remain
durable; raw health payloads and answer text are not copied into queue records.

A worker claims atomically, renews its lease and confirms only the version it
claimed. Changes during execution remain pending. State/Case writes lock and
validate the lease in the same short write transaction. Expired workers cannot
publish stale results. Transient failures use bounded exponential backoff; new
facts can revive a terminal job. External model calls are not promised exactly
once after a process or network failure.

Passive assessment, outcome and automatic Review calls are platform-funded.
Their executor alone records aggregate usage. Run audit identities remain
separate from nullable billing operation identities. User-initiated paid
operations retain their existing admission and settlement behavior.

State updates refresh the facts consumed by Today Suggestion and its cache
fingerprint; they do not eagerly regenerate a suggestion or modify a plan.

Validation:

- `pnpm --dir apps/server test:core`
- `pnpm test:athlete-state:database` (PGlite; add `ATHLETE_STATE_TEST_POSTGRES_URL`
  for disposable PostgreSQL schema tests)
- `pnpm --dir apps/client exec playwright test --config=playwright.athlete-state.config.ts`
