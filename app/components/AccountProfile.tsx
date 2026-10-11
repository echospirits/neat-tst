import { AccountDocuments } from "./AccountDocuments";
import { prisma } from "../../lib/prisma";
import {
  accountKinds,
  readAccountConfiguration,
  territoryMatches,
} from "../../lib/crm/accountConfiguration";
import { CrmForm } from "./CrmForm";
import { CrmAccountPicker } from "./CrmAccountPicker";
import { RecordPicker } from "./RecordPicker";
import { saveAccountMetadataAction } from "../account-memory/metadata-actions";
type Details = {
  documents?: Array<{ name: string; url: string }>;
  kind?: string;
  territoryId?: string;
  teamId?: string;
  parent?: { accountType: "AGENCY" | "WHOLESALE"; accountId: string };
  custom?: Record<string, string | number | boolean | null>;
};
export async function AccountProfile({
  organizationId,
  accountType,
  accountId,
}: {
  organizationId: string;
  accountType: "AGENCY" | "WHOLESALE";
  accountId: string;
}) {
  const [org, overlay, account] = await Promise.all([
    prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { crmPreferences: true },
    }),
    prisma.organizationAccountOverlay.findUnique({
      where: {
        organizationId_accountType_externalAccountId: {
          organizationId,
          accountType,
          externalAccountId: accountId,
        },
      },
      select: { crmDetails: true, crmDetailsVersion: true },
    }),
    accountType === "AGENCY"
      ? prisma.agency.findUnique({
          where: { id: accountId },
          select: { state: true, county: true, zip: true },
        })
      : prisma.wholesaleAccount.findUnique({
          where: { id: accountId },
          select: { state: true, county: true, zip: true },
        }),
  ]);
  const c = readAccountConfiguration(org.crmPreferences),
    d = (overlay?.crmDetails ?? {}) as Details;
  const parent = d.parent
    ? d.parent.accountType === "AGENCY"
      ? await prisma.agency.findUnique({
          where: { id: d.parent.accountId },
          select: { name: true },
        })
      : await prisma.wholesaleAccount.findUnique({
          where: { id: d.parent.accountId },
          select: { name: true },
        })
    : null;
  return (
    <details className="card">
      <summary>Account profile, territory &amp; team</summary>
      <CrmForm
        action={saveAccountMetadataAction}
        submitLabel="Save account profile"
      >
        <input name="accountType" type="hidden" value={accountType} />
        <input name="accountId" type="hidden" value={accountId} />
        <input
          name="version"
          type="hidden"
          value={overlay?.crmDetailsVersion ?? 0}
        />
        <input name="configurationVersion" type="hidden" value={c.version} />
        <RecordPicker
          name="kind"
          label="Account category"
          defaultValue={d.kind ?? ""}
          placeholder="Not set"
          options={[
            ...accountKinds.map((k) => ({
              value: k,
              label: k.toLowerCase().replaceAll("_", " "),
            })),
            ...c.categories.map((k) => ({ value: k.id, label: k.name })),
          ]}
        />
        <RecordPicker
          name="territoryId"
          label="Territory"
          defaultValue={d.territoryId ?? ""}
          placeholder="Unassigned"
          options={c.territories.map((t) => ({
            value: t.id,
            label: `${t.name}${account && territoryMatches(t, account) ? " · Geographic match" : ""}`,
          }))}
        />
        <RecordPicker
          name="teamId"
          label="Team"
          defaultValue={d.teamId ?? ""}
          placeholder="Unassigned"
          options={c.teams.map((t) => ({ value: t.id, label: t.name }))}
        />
        <details>
          <summary>Parent account or group</summary>
          <CrmAccountPicker
            fieldPrefix="parent"
            initial={
              d.parent
                ? { ...d.parent, name: parent?.name ?? "Parent account" }
                : undefined
            }
          />
        </details>
        {c.fields.map((f) => (
          <label key={f.id}>
            {f.name}
            {f.type === "BOOLEAN" ? (
              <select
                name={`custom:${f.id}`}
                defaultValue={
                  d.custom?.[f.id] === null || d.custom?.[f.id] === undefined
                    ? ""
                    : String(d.custom[f.id])
                }
              >
                <option value="">Not recorded</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            ) : (
              <input
                name={`custom:${f.id}`}
                type={
                  f.type === "NUMBER"
                    ? "number"
                    : f.type === "DATE"
                      ? "date"
                      : "text"
                }
                step={f.type === "NUMBER" ? "any" : undefined}
                maxLength={2000}
                defaultValue={String(d.custom?.[f.id] ?? "")}
              />
            )}
          </label>
        ))}
        <AccountDocuments initial={d.documents ?? []} />
        <p className="field-note">
          These settings belong to your organization and do not change shared
          directory or purchase records.
        </p>
      </CrmForm>
    </details>
  );
}
