import twilio from "twilio";
import { createHash } from "node:crypto";
import { getAppEnvironment } from "../../appEnvironment";
export type SmsSend = {
  from: string;
  to: string;
  body: string;
  callback: string;
  requestId: string;
};
export interface SmsProvider {
  send(input: SmsSend): Promise<{ id: string; status: string }>;
}
export class MockSmsProvider implements SmsProvider {
  async send(input: SmsSend) {
    return {
      id: `MOCK${createHash("sha256").update(input.requestId).digest("hex").slice(0, 32)}`,
      status: "DELIVERED",
    };
  }
}
export class TwilioSmsProvider implements SmsProvider {
  constructor(
    private readonly accountSid: string,
    private readonly token: string,
  ) {}
  async send(input: SmsSend) {
    assertLiveSmsEnabled();
    // No automatic HTTP retry: an uncertain result must not send twice.
    const client = twilio(this.accountSid, this.token, {
      autoRetry: false,
      timeout: 15000,
    });
    const message = await client.messages.create({
      from: input.from,
      to: input.to,
      body: input.body,
      statusCallback: input.callback,
    });
    return { id: message.sid, status: message.status.toUpperCase() };
  }
}
export function assertLiveSmsEnabled() {
  if (
    process.env.CRM_SMS_ENABLED !== "true" ||
    process.env.SMS_ENVIRONMENT !== getAppEnvironment()
  )
    throw new Error("Live SMS is not enabled for this environment.");
  const base = new URL(process.env.APP_BASE_URL ?? "http://invalid");
  if (base.protocol !== "https:")
    throw new Error("Live SMS requires a configured HTTPS application URL.");
}
export function validSmsSignature(
  token: string,
  signature: string,
  url: string,
  fields: Record<string, string>,
) {
  return twilio.validateRequest(token, signature, url, fields);
}
export function normalizeSmsPhone(value: string) {
  const digits = value.replace(/[^\d+]/g, "");
  const candidate = /^\d{10}$/.test(digits)
    ? `+1${digits}`
    : /^1\d{10}$/.test(digits)
      ? `+${digits}`
      : digits;
  if (!/^\+[1-9]\d{7,14}$/.test(candidate))
    throw new Error("A valid international phone number is required.");
  return candidate;
}
export function isOptOut(body: string, optOutType?: string) {
  return (
    optOutType === "STOP" ||
    [
      "STOP",
      "STOPALL",
      "UNSUBSCRIBE",
      "CANCEL",
      "END",
      "QUIT",
      "REVOKE",
      "OPTOUT",
    ].includes(body.trim().toUpperCase())
  );
}
export function advanceDelivery(current: string, incoming: string) {
  const rank: Record<string, number> = {
    UNKNOWN: 0,
    SENDING: 0,
    ACCEPTED: 1,
    QUEUED: 1,
    SENDING_PROVIDER: 2,
    SENT: 3,
    DELIVERED: 4,
    UNDELIVERED: 4,
    FAILED: 4,
    CANCELLED: 4,
    CANCELED: 4,
    RECEIVED: 4,
  };
  const next = incoming.toUpperCase();
  if (rank[current] === 4 || !(next in rank)) return current;
  return rank[next] >= (rank[current] ?? 0) ? next : current;
}
