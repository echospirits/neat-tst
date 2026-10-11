import { prisma } from "../../../lib/prisma";
import { getAppEnvironment } from "../../../lib/appEnvironment";
import { CrmForm } from "../../components/CrmForm";
import {
  configureEventbrite,
  syncEventbrite,
  disconnectEventbrite,
} from "./eventbrite-actions";
export async function EventbriteSettings({
  organizationId,
}: {
  organizationId: string;
}) {
  const c = await prisma.eventbriteConnection.findUnique({
    where: { organizationId },
    select: {
      enabled: true,
      mock: true,
      lastSyncAt: true,
      cursor: true,
      externalOrganizationId: true,
    },
  });
  return (
    <section className="card">
      <h2>Eventbrite</h2>
      <details>
        <summary>
          Event import connection ·{" "}
          {c?.enabled ? (c.mock ? "Demo" : "Connected") : "Disconnected"}
        </summary>
        <p>
          Import upcoming events into My Schedule. Existing local staff, dates,
          and outcomes are retained; changed provider details are shown for
          review. Attendance is entered from verified event results.
        </p>
        <CrmForm
          action={configureEventbrite}
          submitLabel="Save Eventbrite connection"
        >
          <label>
            Eventbrite organization ID
            <input
              name="externalOrganizationId"
              defaultValue={c?.mock ? "" : c?.externalOrganizationId}
            />
          </label>
          <label>
            Private token
            <input name="token" type="password" autoComplete="new-password" />
          </label>
          {getAppEnvironment() !== "production" ? (
            <label>
              <input name="mock" type="checkbox" />
              Use demo events
            </label>
          ) : null}
        </CrmForm>
        {c?.enabled ? (
          <>
            <p>
              Last import: {c.lastSyncAt?.toISOString() ?? "Not yet imported"}
            </p>
            <CrmForm
              action={syncEventbrite}
              submitLabel={c.cursor ? "Import next page" : "Import events"}
            />
            <CrmForm
              action={disconnectEventbrite}
              submitLabel="Disconnect Eventbrite"
            />
          </>
        ) : null}
      </details>
    </section>
  );
}
