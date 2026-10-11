# Reviewed AI architecture

`lib/crm/ai.ts` defines the replaceable CommunicationAssistant contract, deterministic MockCommunicationAssistant and OpenAI Responses adapter. Existing weekly digest and account-research AI remain separate established use cases. They are not replaced by a second background agent.

Account retrieval in `aiEvidence.ts` validates the shared account identity and scopes all private rows to the authenticated organization. TEAM records are the default; only the requesting owner may opt their private communications into a request. Platform Support View cannot invoke this private-capable assistant. Worklist retrieval honors existing feature exclusions.

A request supplies at most 20 activity excerpts, 10 visits, 10 open tasks and one planning snapshot. Inputs are bounded and treated as untrusted evidence. There are no tools or autonomous actions. Strict output schemas and server validation reject unknown citation IDs, refusals and incomplete outputs. AI interpretation is visibly labeled; reviewed drafts remain editable, with no send action. Task creation remains the existing account Worklist action.

Live use requires `CRM_AI_ENABLED=true`, `OPENAI_API_KEY`, `CRM_AI_MODEL`, tenant administrator opt-in and per-request member acknowledgment. Otherwise the same UI uses local excerpts and a generic draft, explicitly labeled MOCK. No live model calls were made for implementation acceptance. `store:false` requests no persisted Responses application state; it does not establish a contractual zero-retention policy. Review provider terms before activation.

The audit records request mode/count and actor/tenant, not prompts, generated prose or credentials. An advisory-lock-protected 20 requests/member/hour limit bounds requests. Provider requests deny redirects and time out after 45 seconds. Failures display a safe retry message without altering CRM records.

Tests: `tests/crmAi.test.ts`, `scripts/crm-final-rehearsal.ts`, final responsive browser acceptance. API contract: [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).
