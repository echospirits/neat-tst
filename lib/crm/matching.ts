export type MatchContact = {
  id: string;
  email: string | null;
  emailAliases?: string[];
  agencyId: string | null;
  wholesaleAccountId: string | null;
};
export const normalizeEmail = (email: string) => email.trim().toLowerCase();
export function extractEmails(value: string) {
  return [
    ...new Set(
      (
        value.match(
          /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-Z]{2,}/gi,
        ) ?? []
      ).map(normalizeEmail),
    ),
  ];
}
export type ActivityMatch = {
  status: "MATCHED" | "REVIEW";
  confidence: number;
  contactId: string | null;
  agencyId: string | null;
  wholesaleAccountId: string | null;
  reason: string;
};
export function matchParticipants(
  participants: string[],
  contacts: MatchContact[],
): ActivityMatch {
  const emails = new Set(participants.map(normalizeEmail));
  const candidates = contacts.filter(
    (c) =>
      [c.email, ...(c.emailAliases ?? [])].some(email => email && emails.has(normalizeEmail(email))) &&
      Boolean(c.agencyId) !== Boolean(c.wholesaleAccountId),
  );
  const accounts = new Set(
    candidates.map((c) =>
      c.agencyId ? `a:${c.agencyId}` : `w:${c.wholesaleAccountId}`,
    ),
  );
  if (accounts.size !== 1)
    return {
      status: "REVIEW",
      confidence: accounts.size ? 0.5 : 0,
      contactId: null,
      agencyId: null,
      wholesaleAccountId: null,
      reason: accounts.size
        ? "Participants match multiple accounts."
        : "No exact active contact match.",
    };
  const first = candidates[0];
  return {
    status: "MATCHED",
    confidence: 1,
    contactId: candidates.length === 1 ? first.id : null,
    agencyId: first.agencyId,
    wholesaleAccountId: first.wholesaleAccountId,
    reason: "Exact contact email match to one account.",
  };
}
export function isInternalMessage(
  participants: string[],
  internalEmails: string[],
  mailbox: string,
  internalDomains: string[] = [],
) {
  const internal = new Set([...internalEmails, mailbox].map(normalizeEmail));
  return (
    participants.length > 0 &&
    participants.every((p) => internal.has(normalizeEmail(p)) || internalDomains.includes(normalizeEmail(p).split("@")[1]))
  );
}

// Header display names are unverified hints, never inferred job titles.
export function cleanParticipantName(value: string) {
  return value.replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, 200);
}
export function headerParticipantNames(headers: string[]) {
  const result: Record<string, string> = {};
  for (const header of headers) {
    for (const match of header.matchAll(/(?:^|,)\s*(?:"([^"\r\n]*)"|([^,<]*))\s*<([^<>]+)>/g)) {
      const email = extractEmails(match[3])[0], name = cleanParticipantName(match[1] || match[2] || "");
      if (email && name && !name.includes("@") && !name.startsWith("=?")) result[email] = name;
    }
  }
  return result;
}
