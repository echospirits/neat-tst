import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma, runWithOrganizationStateAccess } from "../../../../../lib/prisma";
import { decryptCalendarToken } from "../../../../../lib/calendar/crypto";
import { ECHO_ORGANIZATION_ID } from '../../../../../lib/echoAccess';
import {
  validSmsSignature,
  normalizeSmsPhone,
  advanceDelivery,
} from "../../../../../lib/crm/sms/provider";
import {
  receiveSms,
  projectSmsActivity,
} from "../../../../../lib/crm/sms/service";
export const dynamic = "force-dynamic";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (
    !request.headers
      .get("content-type")
      ?.startsWith("application/x-www-form-urlencoded")
  )
    return NextResponse.json(
      { error: "Unsupported content." },
      { status: 415 },
    );
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 32000) {
        await reader.cancel();
        return NextResponse.json(
          { error: "Request too large." },
          { status: 413 },
        );
      }
      chunks.push(value);
    }
  }
  const body = Buffer.concat(chunks).toString("utf8");
  const raw = new URLSearchParams(body),
    fields: Record<string, string> = {};
  for (const [key, value] of raw) {
    if (key in fields)
      return NextResponse.json({ error: "Duplicate field." }, { status: 400 });
    fields[key] = value;
  }
  const { id } = await params;
  const connection = await prisma.smsConnection.findUnique({ where: { id } });
  if (
    !connection ||
    connection.organizationId !== ECHO_ORGANIZATION_ID ||
    connection.provider !== "TWILIO" ||
    !connection.credentialsEncrypted
  )
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const signature = request.headers.get("x-twilio-signature") ?? "";
  const base = process.env.APP_BASE_URL?.replace(/\/$/, "");
  if (!base?.startsWith("https://"))
    return NextResponse.json({ error: "Unavailable." }, { status: 503 });
  const signedUrl = `${base}/api/crm/sms/${encodeURIComponent(id)}${request.nextUrl.search}`;
  if (
    fields.AccountSid !== connection.accountSid ||
    !validSmsSignature(
      decryptCalendarToken(connection.credentialsEncrypted),
      signature,
      signedUrl,
      fields,
    )
  )
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  return runWithOrganizationStateAccess(connection.organizationId,async()=>{
  const messageId = request.nextUrl.searchParams.get("messageId");
  try {
    if (messageId) {
      const sid = z
        .string()
        .regex(/^SM[a-fA-F0-9]{32}$/)
        .parse(fields.MessageSid);
      const row = await prisma.smsMessage.findFirst({
        where: {
          id: messageId,
          connectionId: id,
          organizationId: connection.organizationId,
          direction: "OUTBOUND",
        },
      });
      if (
        !row ||
        (row.providerId && row.providerId !== sid) ||
        normalizeSmsPhone(fields.To ?? "") !== row.phone ||
        normalizeSmsPhone(fields.From ?? "") !== connection.sender
      )
        return NextResponse.json(
          { error: "Message mismatch." },
          { status: 400 },
        );
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`sms-status:${messageId}`}, 0))`;
        const current = await tx.smsMessage.findUniqueOrThrow({
          where: { id: row.id },
        });
        const message = await tx.smsMessage.update({
          where: { id: row.id },
          data: {
            providerId: sid,
            status: advanceDelivery(
              current.status,
              fields.MessageStatus ?? fields.SmsStatus ?? "",
            ),
          },
        });
        await projectSmsActivity(tx, message, connection.provider);
        if (message.status !== current.status)
          await tx.organizationAuditEvent.create({
            data: {
              organizationId: connection.organizationId,
              actorUserId: connection.createdByUserId,
              action: "ORGANIZATION_UPDATED",
              metadata: {
                kind: "SMS_DELIVERY",
                messageId: message.id,
                status: message.status,
              },
            },
          });
      });
    } else {
      const input = z
        .object({
          MessageSid: z.string().regex(/^SM[a-fA-F0-9]{32}$/),
          From: z.string(),
          To: z.string(),
          Body: z.string().max(1600),
          OptOutType: z.string().optional(),
        })
        .parse(fields);
      if (normalizeSmsPhone(input.To) !== connection.sender)
        return NextResponse.json(
          { error: "Sender mismatch." },
          { status: 400 },
        );
      await prisma.$transaction((tx) => receiveSms(tx, connection, input), {
        timeout: 15000,
      });
    }
    return new NextResponse("<Response/>", {
      headers: { "content-type": "text/xml" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: "Unable to process message." },
      { status: e instanceof z.ZodError ? 400 : 503 },
    );
  }
  });
}
