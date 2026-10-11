# Worklist playbooks

Worklist remains the only task queue. Organization Setup owns versioned playbook templates with up to 12 steps, relative due days and instructions. Starter templates support introductions, lapsed-account recovery and menu placement. Editing templates does not change runs already in progress.

Starting a playbook on an account snapshots its steps and creates canonical Worklist tasks in one database transaction. The same domain service powers ordinary contextual follow-ups, including source-opportunity lifecycle events. Calendar synchronization occurs after commit and failures do not turn a saved task into a failed request.

Tenant/account/template locking prevents duplicate active runs across concurrent requests. Per-run step keys make retries idempotent. Cancellation uses saved task versions and conditional updates: only untouched OPEN tasks are cancelled. Started, edited, reassigned and completed work is preserved. Tasks remain editable/completable through the existing Worklist actions. Start/stop/template changes are audited.

Playbooks do not send messages. Every outbound business SMS requires a separately reviewed and authorized send with current consent. No autonomous email/SMS marketing or runaway rescheduling is enabled.
