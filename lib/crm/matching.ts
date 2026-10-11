export type MatchContact = {
  id: string;
  email: string | null;
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
      c.email &&
      emails.has(normalizeEmail(c.email)) &&
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
) {
  const internal = new Set([...internalEmails, mailbox].map(normalizeEmail));
  return (
    participants.length > 0 &&
    participants.every((p) => internal.has(normalizeEmail(p)))
  );
}
