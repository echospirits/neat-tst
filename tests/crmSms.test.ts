import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  advanceDelivery,
  isOptOut,
  MockSmsProvider,
  normalizeSmsPhone,
  validSmsSignature,
} from "../lib/crm/sms/provider";
test("SMS normalizes US phone formatting without accepting invalid addresses", () => {
  assert.equal(normalizeSmsPhone("(614) 555-0123"), "+16145550123");
  assert.equal(normalizeSmsPhone("+44 20 7946 0958"), "+442079460958");
  assert.throws(() => normalizeSmsPhone("not-a-phone"));
});
test("Twilio signatures bind the complete URL, query, body, and tenant credential", () => {
  const url = "https://crm.example.invalid/api/crm/sms/one?messageId=two",
    token = "fixture-auth-token";
  const fields = { Body: "STOP", From: "+15005550007", To: "+15005550006" };
  const payload =
    url +
    Object.keys(fields)
      .sort()
      .map((key) => key + fields[key as keyof typeof fields])
      .join("");
  const signature = createHmac("sha1", token).update(payload).digest("base64");
  assert.equal(validSmsSignature(token, signature, url, fields), true);
  assert.equal(
    validSmsSignature("other-tenant-token", signature, url, fields),
    false,
  );
  assert.equal(
    validSmsSignature(token, signature, url.replace("one?", "other?"), fields),
    false,
  );
  assert.equal(
    validSmsSignature(token, signature, url, { ...fields, Body: "START" }),
    false,
  );
});
test("opt-out detection and delivery progression are conservative under duplicate and reordered callbacks", () => {
  for (const text of [
    "stop",
    " STOPALL ",
    "unsubscribe",
    "CANCEL",
    "END",
    "QUIT",
    "REVOKE",
    "OPTOUT",
  ])
    assert.equal(isOptOut(text), true);
  assert.equal(isOptOut("custom keyword", "STOP"), true);
  assert.equal(isOptOut("Please send a price list"), false);
  assert.equal(advanceDelivery("DELIVERED", "SENT"), "DELIVERED");
  assert.equal(advanceDelivery("FAILED", "QUEUED"), "FAILED");
  assert.equal(advanceDelivery("UNKNOWN", "DELIVERED"), "DELIVERED");
});
test("mock sends are deterministic and do not call a network", async () => {
  const provider = new MockSmsProvider(),
    input = {
      from: "+15005550006",
      to: "+15005550007",
      body: "Fixture",
      callback: "https://example.invalid",
      requestId: "one",
    };
  assert.deepEqual(await provider.send(input), await provider.send(input));
  assert.equal((await provider.send(input)).status, "DELIVERED");
});
