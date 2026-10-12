import { createHash } from "node:crypto";
import { z } from "zod";
export type ContactChannel = "EMAIL" | "SMS";
export const phoneIdentity = (value: string) => {
  const digits = value.replace(/\D/g, "");
  return digits.length === 10
    ? `+1${digits}`
    : digits.length >= 7 && digits.length <= 15
      ? `+${digits}`
      : "";
};
export const suggestionKey = (channel: ContactChannel, value: string) =>
  createHash("sha256").update(`${channel}:${value}`).digest("hex");
export function usefulEmail(
  value: string,
  internalEmails: Set<string>,
  internalDomains: Set<string>,
) {
  const email = value.trim().toLowerCase();
  if (
    !z.string().email().max(320).safeParse(email).success ||
    internalEmails.has(email) ||
    internalDomains.has(email.split("@")[1])
  )
    return false;
  return !/^(?:no[._-]?reply|do[._-]?not[._-]?reply|mailer-daemon|postmaster|bounce(?:s)?)(?:[+._-]|@)/i.test(
    email,
  );
}
export function contactHasIdentity(
  contact: {
    email: string | null;
    emailAliases: string[];
    phone: string | null;
    phoneAliases: string[];
  },
  channel: ContactChannel,
  value: string,
) {
  return channel === "EMAIL"
    ? [contact.email, ...contact.emailAliases].some(
        (v) => v?.trim().toLowerCase() === value,
      )
    : [contact.phone, ...contact.phoneAliases].some(
        (v) => v && phoneIdentity(v) === value,
      );
}
export const suggestionPriority = (
  incoming: number,
  outgoing: number,
  lastAt: Date,
) =>
  (incoming && outgoing ? 1000 : 0) +
  Math.min(incoming + outgoing, 100) * 5 +
  lastAt.getTime() / 1e13;

export function contactStillMatchesReview(
  contact: {
    email: string | null;
    emailAliases: string[];
    phone: string | null;
    phoneAliases: string[];
  },
  key: string,
) {
  return (
    [contact.email, ...contact.emailAliases].some(
      (value) =>
        value && suggestionKey("EMAIL", value.trim().toLowerCase()) === key,
    ) ||
    [contact.phone, ...contact.phoneAliases].some(
      (value) =>
        value &&
        phoneIdentity(value) &&
        suggestionKey("SMS", phoneIdentity(value)) === key,
    )
  );
}
