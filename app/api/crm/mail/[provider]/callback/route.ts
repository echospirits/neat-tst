import { NextRequest, NextResponse } from "next/server";
import { requireCrmActor } from "../../../../../../lib/crm/auth";
import {
  finishMailboxOAuth,
  providerInput,
} from "../../../../../../lib/crm/mail/oauth";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { actor } = await requireCrmActor(true);
  const provider = providerInput.safeParse(
    (await params).provider.toUpperCase(),
  );
  const state = request.nextUrl.searchParams.get("state"),
    code = request.nextUrl.searchParams.get("code");
  let status = "authorization-failed";
  if (
    provider.success &&
    state &&
    code &&
    state.length < 200 &&
    code.length < 4096
  ) {
    try {
      await finishMailboxOAuth(actor, provider.data, state, code);
      status = "connected";
    } catch {
      status = "authorization-failed";
    }
  }
  return NextResponse.redirect(
    new URL(`/settings/communications?status=${status}`, request.url),
    {
      headers: {
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    },
  );
}
