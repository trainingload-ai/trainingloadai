# Athlete State model scenarios

These fixtures exercise the production Skill, tool schemas, per-step tool scoping,
Agent loop and final result validation with synthetic model-facing tool responses.
Reads and assessment persistence are replaced at the test boundary. No application
database, account, storage backend, queue worker or billing operation is used.

Preview the scenario definitions without making model requests:

```sh
pnpm eval:athlete-state
```

Explicitly opt into live calls using existing AI configuration:

```sh
pnpm eval:athlete-state --live --output /tmp/athlete-state-scenarios.json
```

An optional `--env-file /path/to/local.env` imports only AI configuration. Values
and the configuration file are never included in the report. `--cases` accepts
comma-separated scenario IDs; `--repeat 3` repeats identical inputs to expose
variability. Concurrency is limited to two cases, each capped at eight Agent steps
and 120 seconds. Model calls incur the configured provider's normal usage cost.

Reports contain the synthetic inputs, each tool's arguments and model-facing
output, the model's original `athlete_state.answer` arguments, the separately
saved assessment, question cards, usage and scenario checks. The saved assessment
includes an empty legacy database field; the model's new result schema does not.
Model reasoning is neither printed nor retained.

State checks express scenario expectations, not a clinical reference standard.
Inspect the actual evidence and output as well as the pass count. A small live
sample is a regression probe, not a guarantee of all future model behavior.
