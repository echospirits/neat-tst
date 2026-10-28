import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import {
  FEATURE_KEYS,
  FEATURE_REGISTRY,
  DEFAULT_FEATURE_KEYS,
  ECHO_FEATURE_KEYS,
  getPackageFeatureKeys,
  getEnvironmentFeatureKeys,
  validateFeatureSelection,
} from "../lib/featureRegistry";
import { requireCommunicationsPilot } from "../lib/crm/communicationsPilot";
import { ingestMailChanges } from "../lib/crm/mail/sync";
import { receiveSms } from "../lib/crm/sms/service";
import { loadContactSuggestions } from "../lib/crm/contactSuggestions";

test("Communications is a disabled Pilot outside standard Core and Intelligence packages", () => {
  assert.equal(FEATURE_REGISTRY.COMMUNICATIONS.category, "Pilot");
  assert.equal(FEATURE_REGISTRY.COMMUNICATIONS.defaultEnabled, false);
  assert.equal(DEFAULT_FEATURE_KEYS.includes("COMMUNICATIONS"), false);
  assert.equal(ECHO_FEATURE_KEYS.includes("COMMUNICATIONS"), true);
  for (const intelligence of [false, true])
    assert.equal(
      getPackageFeatureKeys(intelligence).includes("COMMUNICATIONS"),
      false,
    );
  assert.deepEqual(validateFeatureSelection(["COMMUNICATIONS"]).missing, [
    { feature: "COMMUNICATIONS", dependency: "CORE_CRM" },
  ]);
});

test("the actual organization feature list and direct checks preserve the pilot boundary under the TST override", async () => {
  const text = readFileSync("lib/organizations.ts", "utf8");
  const body = text.slice(
    text.indexOf("export async function getOrganizationFeatures("),
    text.indexOf("export async function requireFeatureForUser("),
  );
  const exports: Record<string, any> = {};
  const rows: Record<string, string[]> = {
    echo: ["CORE_CRM", "COMMUNICATIONS"],
    other: ["CORE_CRM"],
  };
  const compiled = ts.transpileModule(body, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
  runInNewContext(compiled, {
    exports,
    FEATURE_KEYS,
    getEnvironmentFeatureKeys,
    process: { env: { APP_ENV: "test" } },
    prisma: {
      organizationFeature: {
        findMany: async ({ where }: any) => {
          assert.equal(where.enabled, true);
          return rows[where.organizationId].map((featureKey) => ({
            featureKey,
          }));
        },
        findFirst: async ({ where }: any) => {
          assert.equal(where.enabled, true);
          return rows[where.organizationId].includes(where.featureKey)
            ? { id: "flag" }
            : null;
        },
      },
    },
  });
  assert.equal(
    (await exports.getOrganizationFeatures("echo")).has("COMMUNICATIONS"),
    true,
  );
  assert.equal(
    (await exports.getOrganizationFeatures("other")).has("COMMUNICATIONS"),
    false,
  );
  assert.equal(await exports.hasFeature("echo", "COMMUNICATIONS"), true);
  assert.equal(await exports.hasFeature("other", "COMMUNICATIONS"), false);
  assert.equal(await exports.hasFeature("other", "ANALYTICS"), true);
});

test("service guards reject disabled tenants before mail ingestion or contact discovery reads/writes", async () => {
  const db = {
    organizationFeature: {
      findFirst: async ({ where }: any) => {
        assert.equal(where.organizationId, "other");
        assert.equal(where.featureKey, "COMMUNICATIONS");
        assert.equal(where.enabled, true);
        return null;
      },
    },
  } as any;
  await assert.rejects(requireCommunicationsPilot(db, "other"), /pilot access/);
  const actor = { userId: "owner", organizationId: "other" };
  await assert.rejects(
    ingestMailChanges(
      db,
      actor,
      {
        id: "mail",
        email: "owner@brand.invalid",
        provider: "MOCK",
        excludeInternal: true,
        retentionDays: 90,
      },
      [],
    ),
    /pilot access/,
  );
  await assert.rejects(loadContactSuggestions(db, actor), /pilot access/);
});

test("disabling Echo's pilot suppresses inbound SMS storage while still recording verified STOP opt-outs idempotently", async () => {
  let events = 0,
    updates = 0;
  const db = {
    $executeRaw: async () => 0,
    organizationFeature: { findFirst: async () => null },
    smsConsentEvent: {
      findUnique: async () => (events ? { id: "existing" } : null),
      create: async () => {
        events++;
      },
    },
    smsConsent: {
      upsert: async ({ create }: any) => {
        assert.equal(create.status, "OPTED_OUT");
        updates++;
      },
    },
  } as any;
  const connection = {
    id: "sender",
    organizationId: "org_echo_spirits",
    createdByUserId: "owner",
    provider: "TWILIO",
  };
  assert.equal(
    await receiveSms(db, connection, {
      MessageSid: "hello",
      From: "+16145550123",
      Body: "hello",
    }),
    null,
  );
  assert.equal(events, 0);
  for (let n = 0; n < 2; n++)
    assert.equal(
      await receiveSms(db, connection, {
        MessageSid: "stop",
        From: "+16145550123",
        Body: "STOP",
      }),
      null,
    );
  assert.equal(events, 1);
  assert.equal(updates, 1);
});
