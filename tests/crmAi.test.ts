import test from "node:test";
import assert from "node:assert/strict";
import {
  MockCommunicationAssistant,
  OpenAICommunicationAssistant,
  parseAssistantResult,
  type AssistantInput,
} from "../lib/crm/ai";
const input: AssistantInput = {
  accountName: "Fixture",
  purpose: "RESPONSE",
  evidence: [
    {
      id: "task:a",
      kind: "OPEN_WORKLIST",
      text: "Call buyer",
      at: "2026-10-11",
      href: "/alerts",
    },
  ],
};
test("mock assistant is useful without credentials and clearly discloses excerpts", async () => {
  const r = await new MockCommunicationAssistant().generate(input);
  assert.equal(r.mode, "MOCK");
  assert.equal(r.commitments[0].text, "Call buyer");
  assert.ok(r.draft);
});
test("AI output rejects invented source identifiers", () => {
  assert.throws(() =>
    parseAssistantResult(
      {
        summary: [{ text: "Claim", sourceIds: ["other-tenant"] }],
        commitments: [],
        suggestions: [],
        draft: "",
      },
      input,
    ),
  );
});
test("AI adapter has no tools, disables response storage and validates structured output", async () => {
  let calls = 0;
  const provider = new OpenAICommunicationAssistant(
    "fixture-not-a-secret",
    "fixture-model",
    (async (url, init) => {
      calls++;
      assert.equal(url, "https://api.openai.com/v1/responses");
      const body = JSON.parse(String(init?.body));
      assert.equal(body.store, false);
      assert.equal(body.tools, undefined);
      assert.equal(body.text.format.strict, true);
      return Response.json({
        status: "completed",
        output: [
          {
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  summary: [
                    {
                      text: "A buyer call is recorded as open work.",
                      sourceIds: ["task:a"],
                    },
                  ],
                  commitments: [],
                  suggestions: [],
                  draft: "Hello",
                }),
              },
            ],
          },
        ],
      });
    }) as typeof fetch,
  );
  assert.equal((await provider.generate(input)).mode, "AI");
  assert.equal(calls, 1);
});
test("refusals and incomplete output are never presented as successful reviews", async () => {
  for (const payload of [
    { status: "incomplete" },
    { status: "completed", output: [{ content: [{ type: "refusal" }] }] },
  ])
    await assert.rejects(() =>
      new OpenAICommunicationAssistant("fixture", "fixture", (async () =>
        Response.json(payload)) as typeof fetch).generate(input),
    );
});
