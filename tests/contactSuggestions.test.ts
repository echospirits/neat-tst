import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  contactHasIdentity,
  contactStillMatchesReview,
  phoneIdentity,
  suggestionKey,
  suggestionPriority,
  usefulEmail,
} from "../lib/crm/contactSuggestionRules";
import { headerParticipantNames } from "../lib/crm/matching";
describe("communication contact suggestion rules", () => {
  it("excludes own/internal and automated addresses without inferring a restaurant from a domain", () => {
    const internal = new Set(["owner@brand.com"]),
      domains = new Set(["brand.com"]);
    for (const email of [
      "owner@brand.com",
      "staff@brand.com",
      "no-reply@example.com",
      "bounce+123@example.com",
      "broken",
    ])
      assert.equal(usefulEmail(email, internal, domains), false);
    assert.equal(usefulEmail("Buyer@Restaurant.com", internal, domains), true);
  });
  it("matches normalized phones and email aliases", () => {
    const c = {
      email: "Primary@restaurant.com",
      emailAliases: ["buyer@restaurant.com"],
      phone: "(614) 555-0100",
      phoneAliases: ["+16145550101"],
    };
    assert.ok(contactHasIdentity(c, "EMAIL", "primary@restaurant.com"));
    assert.ok(contactHasIdentity(c, "EMAIL", "buyer@restaurant.com"));
    assert.ok(contactHasIdentity(c, "SMS", "+16145550100"));
    assert.ok(contactHasIdentity(c, "SMS", "+16145550101"));
    assert.equal(phoneIdentity("bad"), "");
    assert.notEqual(
      suggestionKey("EMAIL", "same"),
      suggestionKey("SMS", "same"),
    );
  });
  it("ranks reciprocal evidence over one-way volume without assigning customer value", () => {
    const now = new Date();
    assert.ok(suggestionPriority(1, 1, now) > suggestionPriority(100, 0, now));
    assert.ok(suggestionPriority(3, 3, now) > suggestionPriority(1, 1, now));
  });
  it("uses explicit header display names and never invents names from local parts", () => {
    assert.deepEqual(
      headerParticipantNames([
        '"Smith, Sarah" <Sarah@example.com>, Pat Jones <pat@example.com>, unknown@example.com',
      ]),
      { "sarah@example.com": "Smith, Sarah", "pat@example.com": "Pat Jones" },
    );
    assert.deepEqual(
      headerParticipantNames(["=?utf-8?B?encoded?= <x@example.com>"]),
      {},
    );
  });
});

it("a saved review stops being a replay when the identity was removed from the contact", () => {
  const key = suggestionKey("EMAIL", "buyer@restaurant.com"),
    contact = {
      email: "primary@restaurant.com",
      emailAliases: ["buyer@restaurant.com"],
      phone: null,
      phoneAliases: [],
    };
  assert.equal(contactStillMatchesReview(contact, key), true);
  assert.equal(
    contactStillMatchesReview({ ...contact, emailAliases: [] }, key),
    false,
  );
});
