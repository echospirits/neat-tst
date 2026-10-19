import { after, NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createPasswordResetToken, PASSWORD_RESET_COOLDOWN_MS, sendPasswordResetEmail } from '../../../../lib/passwordReset';
import { prisma } from '../../../../lib/prisma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const requestSchema = z.object({
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
});

const GENERIC_RESPONSE = {
  message: 'If an active account uses that email, a password reset link will arrive shortly.',
};

export async function POST(request: NextRequest) {
  let parsed: z.infer<typeof requestSchema>;

  try {
    parsed = requestSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ message: 'Enter a valid email address.' }, { status: 400 });
  }

  // Defer every account-dependent operation until the public response is sent.
  // Pass a callback (not a started promise) so even lookup latency stays private.
  after(async () => {
    try {
      const user = await prisma.user.findUnique({
        where: { email: parsed.email },
        select: { id: true, isActive: true, passwordHash: true },
      });

      if (user?.isActive && user.passwordHash) {
        const issuance = await prisma.$transaction(async (tx) => {
          // Serialize issuance across all app instances before checking the cooldown.
          // Recheck eligibility while locking the existing user row.
          const eligibleUsers = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT "id" FROM "User"
            WHERE "id" = ${user.id} AND "isActive" = TRUE AND "passwordHash" IS NOT NULL
            FOR UPDATE
          `;
          if (eligibleUsers.length !== 1) return null;

          const now = new Date();
          const recentRequest = await tx.passwordResetToken.findFirst({
            where: {
              userId: user.id,
              createdAt: { gt: new Date(now.getTime() - PASSWORD_RESET_COOLDOWN_MS) },
            },
            select: { id: true },
          });
          if (recentRequest) return null;

          const token = createPasswordResetToken(now);
          const record = await tx.passwordResetToken.create({
            data: {
              userId: user.id,
              tokenHash: token.tokenHash,
              expiresAt: token.expiresAt,
              createdAt: now,
            },
          });

          await tx.passwordResetToken.updateMany({
            where: { userId: user.id, id: { not: record.id }, usedAt: null },
            data: { usedAt: now },
          });

          return { record, token };
        }, { isolationLevel: 'ReadCommitted' });

        if (issuance) {
          try {
            await sendPasswordResetEmail({
              recipientEmail: parsed.email,
              resetRequestId: issuance.record.id,
              token: issuance.token.token,
            });
          } catch {
            // Retain the cooldown claim even if delivery fails or its outcome is unknown.
            await prisma.passwordResetToken.updateMany({
              where: { id: issuance.record.id, usedAt: null },
              data: { usedAt: new Date() },
            });
            console.error('Password reset email delivery failed.');
          }
        }
      }
    } catch {
      console.error('Password reset request could not be completed.');
    }
  });

  return NextResponse.json(GENERIC_RESPONSE, { status: 202 });
}
