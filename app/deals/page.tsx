import { randomUUID } from "node:crypto";
import Link from "next/link";
import { prisma } from "../../lib/prisma";
import { requireCrmActor } from "../../lib/crm/auth";
import {
  accountInput,
  accountWhere,
  assertAccount,
  accountQuery,
} from "../../lib/crm/activity";
import { dealForecast } from "../../lib/crm/deals";
import { isAdminRole } from "../../lib/userAccess";
import { PageHeader, EmptyState } from "../components/PageChrome";
import { CrmForm } from "../components/CrmForm";
import { CrmAccountPicker } from "../components/CrmAccountPicker";
import { LiveFilterForm } from "../components/LiveFilterForm";
import {
  createDealAction,
  setupStagesAction,
  saveStageAction,
} from "../crm/actions";
export const dynamic = "force-dynamic";
export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { actor, user } = await requireCrmActor(),
    params = await searchParams,
    account = accountInput.safeParse(params);
  const record = account.success
    ? await assertAccount(prisma, account.data).catch(() => null)
    : null;
  const where = {
    organizationId: actor.organizationId,
    ...(account.success ? accountWhere(account.data) : {}),
    ...(params.q
      ? {
          title: {
            contains: params.q.slice(0, 200),
            mode: "insensitive" as const,
          },
        }
      : {}),
  };
  const [stages, deals] = await Promise.all([
    prisma.dealStage.findMany({
      where: { organizationId: actor.organizationId, active: true },
      orderBy: { position: "asc" },
    }),
    prisma.deal.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: 251,
      include: { stage: true },
    }),
  ]);
  const forecast = dealForecast(deals.slice(0, 250)),
    money = (c: number) =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(c / 100);
  return (
    <>
      <PageHeader
        eyebrow={record?.name ?? "Sales execution"}
        title="Deals"
        description="Track revenue opportunities separately from account relationship status and analytical recommendations."
        actions={
          <Link className="btn secondary" href="/pipeline">
            Account status pipeline
          </Link>
        }
      />
      {!stages.length ? (
        <section className="card crm-panel">
          <h2>Set up deal stages</h2>
          <p>
            The default sequence follows target, contact, discovery, sample,
            evaluation, commitment, first order, repeat order and established
            account.
          </p>
          {isAdminRole(user.role) ? (
            <CrmForm
              action={setupStagesAction}
              submitLabel="Create beverage sales stages"
            />
          ) : (
            <p>
              An organization administrator must configure your stages first.
            </p>
          )}
        </section>
      ) : (
        <>
          <section className="card crm-panel">
            <h2>Open deal forecast</h2>
            <div className="crm-facts">
              <p>{forecast.openCount} open deals</p>
              <p>{money(forecast.totalCents)} entered revenue</p>
              <p>{money(forecast.weightedCents)} probability-weighted</p>
              <p>{forecast.unvalued} without an estimate</p>
            </div>
            <p className="muted">
              Estimates from user-entered USD revenue × probability; not
              verified sales. Reflects this filtered view
              {deals.length > 250 ? " (first 250 deals)" : ""}.
            </p>
          </section>
          <details className="card crm-panel" open={!deals.length}>
            <summary>Create deal{record ? ` for ${record.name}` : ""}</summary>
            <CrmForm action={createDealAction} submitLabel="Create deal">
              <input type="hidden" name="submissionKey" value={randomUUID()} />
              <CrmAccountPicker
                initial={
                  account.success && record
                    ? { ...account.data, name: record.name }
                    : undefined
                }
              />
              <label htmlFor="deal-title">Deal title</label>
              <input name="title" id="deal-title" required maxLength={200} />
              <label htmlFor="deal-stage">Stage</label>
              <select name="stageId" id="deal-stage">
                {stages.map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <label htmlFor="deal-next">Next action (optional)</label>
              <input id="deal-next" name="nextAction" maxLength={500} />
              <details>
                <summary>Revenue, products and details</summary>
                <label htmlFor="deal-revenue">
                  Estimated revenue in USD (optional)
                </label>
                <input
                  id="deal-revenue"
                  name="revenueAmount"
                  type="number"
                  min={0}
                  max={20000000}
                  step="0.01"
                />
                <label htmlFor="deal-probability">
                  Probability percent (optional; defaults to stage)
                </label>
                <input
                  id="deal-probability"
                  name="probability"
                  type="number"
                  min={0}
                  max={100}
                />
                <label htmlFor="deal-volume">Estimated units (optional)</label>
                <input
                  id="deal-volume"
                  name="volume"
                  type="number"
                  min={0}
                  step="any"
                />
                <label htmlFor="deal-close">Expected close (optional)</label>
                <input id="deal-close" name="expectedCloseAt" type="date" />
                <label htmlFor="deal-products">
                  Target products, comma separated (optional)
                </label>
                <input
                  id="deal-products"
                  name="targetProducts"
                  maxLength={2000}
                />
                <label htmlFor="deal-competitors">Competitors (optional)</label>
                <textarea
                  id="deal-competitors"
                  name="competitors"
                  maxLength={2000}
                />
                <label htmlFor="deal-objections">Objections (optional)</label>
                <textarea
                  id="deal-objections"
                  name="objections"
                  maxLength={2000}
                />
                <label htmlFor="deal-notes">Notes (optional)</label>
                <textarea id="deal-notes" name="notes" maxLength={4000} />
              </details>
              <p className="muted">
                You own this deal. Placement and order stages are seller
                assertions; verify purchases in account sales history. Next
                action is a description; create a scheduled follow-up in
                Worklist.
              </p>
            </CrmForm>
          </details>
          <LiveFilterForm
            className="crm-form"
            role="search"
            label="Search deals"
          >
            <label htmlFor="deal-search">Search deals</label>
            <input
              id="deal-search"
              name="q"
              type="search"
              defaultValue={params.q ?? ""}
            />
          </LiveFilterForm>
          <div className="crm-board">
            {stages.map((stage) => (
              <section
                className={`card crm-panel${deals.some((d) => d.stageId === stage.id) ? "" : " crm-empty-stage"}`}
                key={stage.id}
              >
                <h2>{stage.name}</h2>
                {deals
                  .filter((d) => d.stageId === stage.id)
                  .slice(0, 250)
                  .map((deal) => (
                    <article className="crm-deal" key={deal.id}>
                      <h3>
                        <Link href={`/deals/${deal.id}`}>{deal.title}</Link>
                      </h3>
                      <p>
                        {deal.status} ·{" "}
                        {deal.revenueCents === null
                          ? "Revenue not estimated"
                          : money(deal.revenueCents)}
                      </p>
                      {deal.nextAction ? <p>{deal.nextAction}</p> : null}
                    </article>
                  ))}
                {!deals.some((d) => d.stageId === stage.id) ? (
                  <p className="muted">No deals in this stage.</p>
                ) : null}
              </section>
            ))}
          </div>
        </>
      )}
      {isAdminRole(user.role) ? (
        <details className="card crm-panel">
          <summary>Configure stages</summary>
          <p>
            Renaming a stage preserves its history identity. Changing its
            probability affects new deals and later stage moves.
          </p>
          {stages.map((s) => (
            <CrmForm
              key={s.id}
              action={saveStageAction}
              submitLabel="Save stage"
            >
              <input type="hidden" name="id" value={s.id} />
              <label>
                Stage name
                <input
                  name="name"
                  defaultValue={s.name}
                  required
                  maxLength={80}
                />
              </label>
              <label>
                Order
                <input
                  name="position"
                  type="number"
                  defaultValue={s.position}
                  min={0}
                  max={1000}
                />
              </label>
              <label>
                Probability %
                <input
                  name="probability"
                  type="number"
                  defaultValue={s.probability}
                  min={0}
                  max={100}
                />
              </label>
            </CrmForm>
          ))}
          <h3>Add a stage</h3>
          <CrmForm action={saveStageAction} submitLabel="Add stage">
            <label>
              Name
              <input name="name" required maxLength={80} />
            </label>
            <label>
              Order
              <input
                name="position"
                type="number"
                defaultValue={stages.length}
                min={0}
                max={1000}
              />
            </label>
            <label>
              Probability %
              <input
                name="probability"
                type="number"
                defaultValue={10}
                min={0}
                max={100}
              />
            </label>
          </CrmForm>
        </details>
      ) : null}
      {deals.length > 250 ? (
        <p>
          Showing up to 250 recent deals. Narrow your search to find older
          deals.
        </p>
      ) : null}
    </>
  );
}
