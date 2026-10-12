import { projectSmsActivity } from "./sms/service";
import { z } from "zod";
import {
  type CrmActor,
  type CrmDb,
  type CrmAccount,
  CrmError,
  assertAccount,
  accountWhere,
  correctActivity,
} from "./activity";
import {
  contactHasIdentity,
  contactStillMatchesReview,
  phoneIdentity,
  suggestionKey,
  suggestionPriority,
  usefulEmail,
  type ContactChannel,
} from "./contactSuggestionRules";
import { cleanParticipantName } from "./matching";
import {
  createAccountContactRecord,
  lockAccountContacts,
} from "./contactCreation";

type AccountRef = {
  agencyId: string | null;
  wholesaleAccountId: string | null;
};
const refKey = (r: AccountRef) =>
  `${r.agencyId || ""}:${r.wholesaleAccountId || ""}`;
export type ContactSuggestion = {
  key: string;
  channel: ContactChannel;
  value: string;
  name: string;
  incoming: number;
  outgoing: number;
  lastAt: Date;
  accounts: Array<CrmAccount & { name: string }>;
  evidence: Array<{
    id: string;
    at: Date;
    summary: string;
    url: string | null;
    source: string;
  }>;
  existing: Array<{ id: string; name: string; accountLabel: string }>;
};
async function assertMember(db: CrmDb, actor: CrmActor) {
  if (
    !(await db.user.findFirst({
      where: {
        id: actor.userId,
        organizationId: actor.organizationId,
        isActive: true,
        role: { not: "TASTER" },
      },
      select: { id: true },
    }))
  )
    throw new CrmError(
      "Contact suggestions require your own organization membership.",
    );
}
export async function loadContactSuggestions(
  db: CrmDb,
  actor: CrmActor,
  account?: CrmAccount,
  includeDismissed = false,
) {
  await assertMember(db, actor);
  if (account) await assertAccount(db, account);
  const since = new Date(Date.now() - 90 * 86400000),
    scope = account ? accountWhere(account) : {};
  const [mail, sms, contacts, users, connections, reviews] = await Promise.all([
    db.accountActivity.findMany({
      where: {
        organizationId: actor.organizationId,
        createdByUserId: actor.userId,
        connectionId: { not: null },
        connection: {
          is: { organizationId: actor.organizationId, userId: actor.userId },
        },
        activityType: "EMAIL",
        occurredAt: { gte: since, lte: new Date() },
        ...scope,
      },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: 1001,
      select: {
        id: true,
        participants: true,
        participantNames: true,
        summary: true,
        occurredAt: true,
        direction: true,
        agencyId: true,
        wholesaleAccountId: true,
        source: true,
        externalUrl: true,
      },
    }),
    db.smsMessage.findMany({
      where: {
        organizationId: actor.organizationId,
        createdAt: { gte: since },
        ...scope,
        OR: [
          { direction: "INBOUND" },
          { direction: "OUTBOUND", status: { in: ["SENT", "DELIVERED"] } },
        ],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 501,
      select: {
        id: true,
        phone: true,
        body: true,
        createdAt: true,
        direction: true,
        agencyId: true,
        wholesaleAccountId: true,
      },
    }),
    db.locationContact.findMany({
      where: {
        organizationId: actor.organizationId,
        active: true,
        mergedIntoContactId: null,
      },
      select: {
        id: true,
        name: true,
        email: true,
        emailAliases: true,
        phone: true,
        phoneAliases: true,
        agencyId: true,
        wholesaleAccountId: true,
      },
      take: 10001,
    }),
    db.user.findMany({
      where: { organizationId: actor.organizationId },
      select: { email: true },
    }),
    db.mailboxConnection.findMany({
      where: { organizationId: actor.organizationId },
      select: { email: true, internalDomains: true },
    }),
    db.contactSuggestionReview.findMany({
      where: { ...actor },
      select: { identityKey: true, status: true },
    }),
  ]);
  // Never expose another mailbox owner's address/settings; these sets are server-only exclusions.
  const internal = new Set(
      [...users.map((u) => u.email), ...connections.map((c) => c.email)].map(
        (v) => v.toLowerCase(),
      ),
    ),
    domains = new Set(
      connections.flatMap((c) => c.internalDomains).map((v) => v.toLowerCase()),
    );
  const hidden = new Set(
    includeDismissed
      ? []
      : reviews
          .filter((r) => r.status === "DISMISSED")
          .map((r) => r.identityKey),
  );
  const identityContacts = new Map<string, typeof contacts>();
  for (const c of contacts) {
    for (const email of [c.email, ...c.emailAliases])
      if (email) {
        const key = `EMAIL:${email.trim().toLowerCase()}`;
        identityContacts.set(key, [...(identityContacts.get(key) || []), c]);
      }
    for (const phone of [c.phone, ...c.phoneAliases])
      if (phone) {
        const normalized = phoneIdentity(phone);
        if (normalized) {
          const key = `SMS:${normalized}`;
          identityContacts.set(key, [...(identityContacts.get(key) || []), c]);
        }
      }
  }
  const grouped = new Map<
    string,
    ContactSuggestion & { refs: Map<string, AccountRef> }
  >();
  const add = (
    channel: ContactChannel,
    value: string,
    name: string,
    row: AccountRef,
    at: Date,
    direction: string | null,
    evidence: ContactSuggestion["evidence"][number],
  ) => {
    const key = suggestionKey(channel, value);
    if (hidden.has(key)) return;
    const matches = identityContacts.get(`${channel}:${value}`) || [];
    if (
      matches.some((c) => refKey(c) === refKey(row)) ||
      (!row.agencyId && !row.wholesaleAccountId && matches.length)
    )
      return;
    let candidate = grouped.get(key);
    if (!candidate) {
      candidate = {
        key,
        channel,
        value,
        name,
        incoming: 0,
        outgoing: 0,
        lastAt: at,
        accounts: [],
        evidence: [],
        existing: [],
        refs: new Map(),
      };
      grouped.set(key, candidate);
    }
    if (direction === "INBOUND") candidate.incoming++;
    if (direction === "OUTBOUND") candidate.outgoing++;
    if (at > candidate.lastAt) candidate.lastAt = at;
    if (!candidate.name && name) candidate.name = name;
    if (row.agencyId || row.wholesaleAccountId)
      candidate.refs.set(refKey(row), row);
    if (candidate.evidence.length < 3) candidate.evidence.push(evidence);
  };
  for (const row of mail.slice(0, 1000))
    for (const email of [
      ...new Set(row.participants.slice(0, 100).map((v) => v.toLowerCase())),
    ]) {
      if (!usefulEmail(email, internal, domains)) continue;
      const names =
        row.participantNames &&
        typeof row.participantNames === "object" &&
        !Array.isArray(row.participantNames)
          ? row.participantNames
          : {};
      const name =
        typeof names[email] === "string"
          ? cleanParticipantName(names[email])
          : "";
      add("EMAIL", email, name, row, row.occurredAt, row.direction, {
        id: row.id,
        at: row.occurredAt,
        summary: row.summary || "Email",
        url: row.externalUrl,
        source: row.source,
      });
    }
  for (const row of sms.slice(0, 500)) {
    const phone = phoneIdentity(row.phone);
    if (phone)
      add("SMS", phone, "", row, row.createdAt, row.direction, {
        id: row.id,
        at: row.createdAt,
        summary: row.body.slice(0, 250),
        url: null,
        source: "Business SMS",
      });
  }
  const ranked = [...grouped.values()].sort(
    (a, b) =>
      suggestionPriority(b.incoming, b.outgoing, b.lastAt) -
      suggestionPriority(a.incoming, a.outgoing, a.lastAt),
  );
  const suggestions = ranked.slice(0, 200);
  const refs = [
    ...suggestions.flatMap((s) => [...s.refs.values()]),
    ...suggestions.flatMap(
      (s) => identityContacts.get(`${s.channel}:${s.value}`) || [],
    ),
  ];
  const [agencies, restaurants] = await Promise.all([
    db.agency.findMany({
      where: {
        id: {
          in: [
            ...new Set(refs.flatMap((r) => (r.agencyId ? [r.agencyId] : []))),
          ],
        },
      },
      select: { id: true, name: true },
    }),
    db.wholesaleAccount.findMany({
      where: {
        id: {
          in: [
            ...new Set(
              refs.flatMap((r) =>
                r.wholesaleAccountId ? [r.wholesaleAccountId] : [],
              ),
            ),
          ],
        },
        mergedIntoId: null,
      },
      select: { id: true, name: true },
    }),
  ]);
  const labels = new Map<string, string>([
    ...agencies.map((a) => [`${a.id}:`, a.name] as const),
    ...restaurants.map((a) => [`:${a.id}`, a.name] as const),
  ]);
  for (const s of suggestions) {
    s.accounts = [...s.refs.values()]
      .filter((r) => labels.has(refKey(r)))
      .map((r) => ({
        accountType: r.agencyId ? "AGENCY" : "WHOLESALE",
        accountId: (r.agencyId || r.wholesaleAccountId)!,
        name: labels.get(refKey(r))!,
      }));
    s.existing = (identityContacts.get(`${s.channel}:${s.value}`) || [])
      .filter(
        (c) =>
          contactHasIdentity(c, s.channel, s.value) && labels.has(refKey(c)),
      )
      .map((c) => ({
        id: c.id,
        name: c.name,
        accountLabel: labels.get(refKey(c))!,
      }));
  }
  return {
    suggestions: suggestions.map(({ refs, ...s }) => s),
    limited:
      ranked.length > 200 ||
      mail.length > 1000 ||
      sms.length > 500 ||
      contacts.length > 10000,
  };
}
const reviewInput = z.object({
  key: z.string().regex(/^[a-f0-9]{64}$/),
  operation: z.enum(["CREATE", "LINK", "DISMISS"]),
  accountType: z.enum(["AGENCY", "WHOLESALE"]).optional(),
  accountId: z.string().max(100).optional(),
  name: z.string().trim().max(200).optional(),
  contactId: z.string().max(100).optional(),
  confirmed: z.literal("true").optional(),
});
export async function reviewContactSuggestion(
  db: CrmDb,
  actor: CrmActor,
  raw: unknown,
) {
  const input = reviewInput.parse(raw);
  await assertMember(db, actor);
  await lockAccountContacts(db, actor.organizationId);
  const prior = await db.contactSuggestionReview.findUnique({
    where: {
      organizationId_userId_identityKey: { ...actor, identityKey: input.key },
    },
  });
  if (
    prior?.status === "ACCEPTED" &&
    prior.contactId &&
    input.accountId &&
    input.accountType &&
    input.operation !== "DISMISS"
  ) {
    const saved = await db.locationContact.findFirst({
      where: {
        id: prior.contactId,
        organizationId: actor.organizationId,
        active: true,
        ...accountWhere({
          accountId: input.accountId,
          accountType: input.accountType,
        }),
      },
      select: {
        id: true,
        email: true,
        emailAliases: true,
        phone: true,
        phoneAliases: true,
      },
    });
    if (saved && contactStillMatchesReview(saved, input.key))
      return { contactId: saved.id, already: true };
  }
  const { suggestions } = await loadContactSuggestions(
      db,
      actor,
      undefined,
      true,
    ),
    suggestion = suggestions.find((s) => s.key === input.key);
  if (!suggestion)
    throw new CrmError(
      "This suggestion is no longer available. Refresh to review current evidence.",
    );
  const record = async (status: string, contactId: string | null) =>
    db.contactSuggestionReview.upsert({
      where: {
        organizationId_userId_identityKey: { ...actor, identityKey: input.key },
      },
      create: { ...actor, identityKey: input.key, status, contactId },
      update: { status, contactId },
    });
  if (input.operation === "DISMISS") {
    await record("DISMISSED", null);
    return { contactId: null, already: false };
  }
  if (input.confirmed !== "true")
    throw new CrmError("Confirm the person and account before saving.");
  if (!input.accountId || !input.accountType)
    throw new CrmError("Choose the restaurant or retail account.");
  const account = {
    accountId: input.accountId,
    accountType: input.accountType,
  };
  await assertAccount(db, account);
  const contacts = await db.locationContact.findMany({
    where: {
      organizationId: actor.organizationId,
      ...accountWhere(account),
      mergedIntoContactId: null,
    },
  });
  const duplicate = contacts.find((c) =>
    contactHasIdentity(c, suggestion.channel, suggestion.value),
  );
  if (duplicate && !duplicate.active)
    throw new CrmError(
      "An inactive contact already uses this address or number at this account. Review and reactivate it in Contacts instead of adding a duplicate.",
    );
  let contact = duplicate;
  if (!contact && input.operation === "LINK") {
    contact = contacts.find((c) => c.id === input.contactId && c.active);
    if (!contact)
      throw new CrmError("Choose an active contact at the selected account.");
    const aliases =
      suggestion.channel === "EMAIL"
        ? contact.emailAliases
        : contact.phoneAliases;
    if (aliases.length >= 10)
      throw new CrmError(
        "This contact already has ten aliases. Review its contact details first.",
      );
    contact = await db.locationContact.update({
      where: { id: contact.id, organizationId: actor.organizationId },
      data:
        suggestion.channel === "EMAIL"
          ? contact.email
            ? { emailAliases: { push: suggestion.value } }
            : { email: suggestion.value }
          : contact.phone
            ? { phoneAliases: { push: suggestion.value } }
            : { phone: suggestion.value },
    });
  }
  if (!contact) {
    if (!input.name) throw new CrmError("Enter the contact's name.");
    contact = await createAccountContactRecord(db, actor, {
      ...accountWhere(account),
      name: input.name,
      email: suggestion.channel === "EMAIL" ? suggestion.value : null,
      phone: suggestion.channel === "SMS" ? suggestion.value : null,
      source: "COMMUNICATION_REVIEW",
      active: true,
      isPrimary: false,
    });
  }
  // Associate only the displayed supporting records when unassigned or already at the chosen account.
  // Never move correspondence away from a different account or share private email.
  const sourceIds = suggestion.evidence.map((e) => e.id);
  const associationScope = {
    OR: [{ agencyId: null, wholesaleAccountId: null }, accountWhere(account)],
  };
  if (suggestion.channel === "EMAIL") {
    const rows = await db.accountActivity.findMany({
      where: {
        organizationId: actor.organizationId,
        createdByUserId: actor.userId,
        id: { in: sourceIds },
        activityType: "EMAIL",
        participants: { has: suggestion.value },
        connection: {
          is: { organizationId: actor.organizationId, userId: actor.userId },
        },
        ...associationScope,
      },
    });
    for (const row of rows) {
      if (!row.contactId)
        await correctActivity(db, actor, {
          id: row.id,
          ...account,
          contactId: contact.id,
          visibility: row.visibility,
        });
    }
  } else {
    const rows = await db.smsMessage.findMany({
      where: {
        organizationId: actor.organizationId,
        id: { in: sourceIds },
        phone: suggestion.value,
        contactId: null,
        ...associationScope,
      },
      include: { connection: { select: { provider: true } } },
    });
    for (const row of rows) {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`sms-associate:${actor.organizationId}:${row.id}`}, 0))`;
      const updated = await db.smsMessage.updateMany({
        where: {
          id: row.id,
          organizationId: actor.organizationId,
          contactId: null,
          ...associationScope,
        },
        data: { ...accountWhere(account), contactId: contact.id },
      });
      if (updated.count) {
        await projectSmsActivity(
          db,
          { ...row, ...accountWhere(account), contactId: contact.id },
          row.connection.provider,
        );
        await db.accountActivity.updateMany({
          where: {
            organizationId: actor.organizationId,
            sourceKey: `sms:${row.id}`,
            contactId: null,
          },
          data: { contactId: contact.id },
        });
      }
    }
  }
  await record("ACCEPTED", contact.id);
  // Audit contact decisions without copying private subjects, bodies or source identifiers to tenant-wide audit.
  await db.organizationAuditEvent.create({
    data: {
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: "ORGANIZATION_UPDATED",
      metadata: {
        kind: "CONTACT_SUGGESTION_ACCEPTED",
        contactId: contact.id,
        channel: suggestion.channel,
        operation: duplicate ? "EXISTING" : input.operation,
      },
    },
  });
  return { contactId: contact.id, already: Boolean(duplicate) };
}
