# Dean’s shared writers’ room

The private Netlify application is the canonical conversation, uploaded manuscripts,
controls, advisor history, background sessions and versioned chapter drafts.
The older ChatGPT-hosted application redirects here and keeps a read-only archive.

Scheduled ChatGPT agents open this page and use its authenticated WebMCP actions.
Those actions use the same database as the visible chat. Native agent sessions do
not call the paid model endpoint. Morning and special emails summarize this record.

Functions accept the verified owner from the private project’s `context.user`,
with existing Netlify Identity sessions supported as a fallback. No shared API
secret, extra credential, public access or browser-side model key is introduced.
Model inference stays behind owner authentication, pause/topic/session guards,
and the existing shared cap of at most 30 calls per Central calendar day.

`npm test` exercises real Postgres semantics in PGlite: idempotency, imports,
pause/cancellation, draft version conflicts, evidence-based profiles and complete
manuscript pagination. `npm run build` bundles login and browser-agent tools.
Schema additions are deployed through Netlify’s migration directory.

## Automatic discussion

Sending a message with automatic discussion enabled starts a durable server-side
background session. Morgan chooses the next speakers. Each separate advisor call
reads the actual saved conversation and current draft before contributing. Morgan
then directs another exchange; no new owner message is required between turns.
Complete proposed chapter and story-bible versions are saved privately.

Queued jobs are claimed once; repeated dispatches cannot repeat paid turns. All
turns share the existing Central-day 30-call cap. Pause, parked topics, a genuine
missing author decision, provider errors and the platform working checkpoint stop
the loop. A native ChatGPT working session takes priority over paid automatic work.
The browser can close after the background job has started.
