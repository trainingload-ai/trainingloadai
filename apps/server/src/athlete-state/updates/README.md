# Athlete State updates

Fact writers request an update after a relevant adopted fact changes. A worker
activates the `athlete-state` Skill in the existing Coach Agent loop. The Agent
chooses its evidence tools, asks a question when needed and saves a structured
assessment through `athlete_state.answer`. Webhooks never call the model inline.

The flow is:

1. Commit adopted facts and a durable update request together.
2. Claim the coalesced user task and check eligibility again.
3. Resume the persistent Athlete State background conversation with event
   metadata. Do not preload health evidence, Memory or plan context.
4. Run the Skill through the shared tool loop. `training.data_coverage` is
   required; `health.summary`, training, metrics, Memory and plan reads are
   available when relevant. Actual read receipts identify the submitted state.
5. Save the validated assessment, or persist an `ask_user_question` interaction
   on the existing `CoachRun`. Homepage answers use its normal answer command
   and next attempt, with the same Skill, tool boundary and platform funding.

There is no second outcome Agent, hand-built answer list or Case-scoping input.
Existing Cases remain readable for compatibility; new assessments and inquiries
do not require one. Question text is restored from owned conversation history
when a late reply falls outside the recent-message window. Historical dialogue
provides continuity; current tool reads establish the facts for each assessment.

The result tool and server writer share a strict schema for state, confidence,
decision readiness, attributed evidence dimensions, hypotheses, safety flags and
limitations. Known states require an actual fact read beyond data coverage or
configuration. A necessary question uses the existing `awaiting_input` interaction;
`NEEDS_USER_INPUT` and `evidenceRequests` belong to legacy Case handling and are not
accepted in the new terminal result. Missing optional recovery measures normally
produce an explicit limitation, rather than a question or an abnormal state.

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
User answers bypass only the automatic preference. Expected refusals are skips.

Health triggers are adopted changes to sleep duration/score, rMSSD, SDNN and
VO₂max inside the current evidence window. Standalone weight, steps and resting
heart rate remain passive facts. Effective FTP/VO₂max settings, completed activity
processing, changed PMC, Review and independent Memory changes share the queue.
Maintenance replay preserves its suppression policy. Raw health payloads and
answer text are not copied into queue records.

A worker claims atomically, renews its lease and confirms only the version it
claimed. Changes during execution remain pending. State writes lock and
validate the lease in the same short write transaction. Expired workers cannot
publish stale results. Late interactive turns cannot supersede a newer state.
Transient failures use bounded exponential backoff; new
facts can revive a terminal job. External model calls are not promised exactly
once after a process or network failure.

Passive assessment, its question continuations and automatic Review calls are platform-funded.
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
- `pnpm eval:athlete-state` previews synthetic scenarios without network calls.
  Explicit `--live` runs the production Agent loop against the configured model
  with synthetic reads and in-memory persistence. See
  [the scenario runner](../../../test/athlete-state-scenarios/README.md) for
  complete input/output reports and repeatability probes.
