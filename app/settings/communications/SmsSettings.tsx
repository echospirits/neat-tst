import { prisma } from "../../../lib/prisma";
import { getAppEnvironment } from "../../../lib/appEnvironment";
import { CrmForm } from "../../components/CrmForm";
import { configureSmsAction, associateSmsAction } from "./sms-actions";
import { CrmAccountPicker } from "../../components/CrmAccountPicker";
export async function SmsSettings({
  organizationId,
  admin,
}: {
  organizationId: string;
  admin: boolean;
}) {
  const connections = await prisma.smsConnection.findMany({
    where: { organizationId },
    select: { id: true, provider: true, sender: true, enabled: true },
  });
  const unmatched = await prisma.smsMessage.findMany({
    where: {
      organizationId,
      direction: "INBOUND",
      agencyId: null,
      wholesaleAccountId: null,
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, phone: true, body: true },
  });
  return (
    <section className="card crm-panel">
      <h2>Organization text messaging</h2>
      <p>
        Business texts are shared with your team. Connect one sending identity,
        then review consent and messages from account Contacts.
      </p>
      {connections.map((connection) => (
        <p key={connection.id}>
          {connection.provider} · {connection.sender ?? "Demo identity"} ·{" "}
          {connection.enabled ? "Enabled" : "Disabled"}
        </p>
      ))}
      {unmatched.length ? (
        <details>
          <summary>{unmatched.length} texts need account review</summary>
          {unmatched.map((message) => (
            <article className="card" key={message.id}>
              <strong>{message.phone}</strong>
              <p>{message.body}</p>
              <CrmForm
                action={associateSmsAction}
                submitLabel="Associate with account"
              >
                <input name="id" type="hidden" value={message.id} />
                <CrmAccountPicker />
              </CrmForm>
            </article>
          ))}
        </details>
      ) : null}
      {admin ? (
        <>
          {getAppEnvironment() !== "production" ? (
            <details>
              <summary>Try SMS with fixtures</summary>
              <CrmForm
                action={configureSmsAction}
                submitLabel="Enable demo SMS"
              >
                <input name="provider" type="hidden" value="MOCK" />
              </CrmForm>
            </details>
          ) : null}
          <details>
            <summary>Configure Twilio</summary>
            <p className="field-note">
              The operator must enable CRM_SMS_ENABLED and set SMS_ENVIRONMENT
              for this environment. Complete the applicable carrier registration
              and configure the inbound webhook before use.
            </p>
            <CrmForm
              action={configureSmsAction}
              submitLabel="Verify and save sending identity"
            >
              <input type="hidden" name="provider" value="TWILIO" />
              <label>
                Account SID
                <input name="accountSid" required autoComplete="off" />
              </label>
              <label>
                Auth token
                <input
                  name="authToken"
                  type="password"
                  required
                  autoComplete="new-password"
                />
              </label>
              <label>
                Sending phone number
                <input
                  name="sender"
                  type="tel"
                  required
                  placeholder="+16145550123"
                />
              </label>
              <label>
                <input name="registrationVerified" type="checkbox" required /> I
                verified the applicable messaging registration and approved use
                for this organization.
              </label>
              <label>
                <input name="authorizeIdentity" type="checkbox" required /> I
                authorize this organization's sending identity.
              </label>
            </CrmForm>
          </details>
          {connections.length ? (
            <CrmForm
              action={configureSmsAction}
              submitLabel="Disable SMS sending"
            >
              <input type="hidden" name="provider" value="DISABLE" />
            </CrmForm>
          ) : null}
          {connections
            .filter((connection) => connection.provider === "TWILIO")
            .map((connection) => (
              <p key={`url-${connection.id}`} className="crm-prewrap">
                Inbound webhook: {process.env.APP_BASE_URL}/api/crm/sms/
                {connection.id}
              </p>
            ))}
        </>
      ) : (
        <p className="muted">
          An organization administrator manages the sending identity.
        </p>
      )}
    </section>
  );
}
