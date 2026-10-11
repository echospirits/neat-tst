import { NextRequest, NextResponse } from "next/server";
import { requireCrmActor } from "../../../../../../lib/crm/auth";
import {
  beginMailboxOAuth,
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
  if (!provider.success)
    return NextResponse.json(
      { error: "Unsupported provider." },
      { status: 400 },
    );
  try {
    return NextResponse.redirect(await beginMailboxOAuth(actor, provider.data));
  } catch {
    return NextResponse.redirect(
      new URL("/settings/communications?status=not-configured", request.url),
    );
  }
}
