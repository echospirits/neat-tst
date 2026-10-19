"use client";
import { useState } from "react";
import { AccountSalesStatus } from "@prisma/client";
import { CrmForm } from "../../components/CrmForm";
import {
  beverageStages,
  type readPipelineStages,
} from "../../../lib/crm/pipelineStages";
import { savePipelineStages } from "./pipeline-stage-actions";
export function PipelineStageEditor({
  configuration,
}: {
  configuration: ReturnType<typeof readPipelineStages>;
}) {
  const [stages, setStages] = useState(configuration.stages);
  const move = (i: number, d: number) => {
    const next = [...stages];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setStages(next);
  };
  return (
    <details className="card">
      <summary>Pipeline sales stages</summary>
      <p>
        Customize detailed stages inside the existing Pipeline. Each stage maps
        to a canonical relationship status so Worklist and purchase-driven
        status changes keep working. Reported first/repeat-order stages do not
        verify purchase history.
      </p>
      <CrmForm action={savePipelineStages} submitLabel="Save pipeline stages">
        <input
          name="configuration"
          type="hidden"
          value={JSON.stringify({ ...configuration, stages })}
        />
        {!stages.length ? (
          <button
            type="button"
            className="secondary"
            onClick={() => setStages(beverageStages)}
          >
            Use beverage-sales stages
          </button>
        ) : null}
        {stages.map((s, i) => (
          <fieldset className="card" key={s.id}>
            <legend>Stage {i + 1}</legend>
            <label>
              Stage name
              <input
                required
                maxLength={80}
                value={s.name}
                onChange={(e) =>
                  setStages(
                    stages.map((r, j) =>
                      i === j ? { ...r, name: e.target.value } : r,
                    ),
                  )
                }
              />
            </label>
            <label>
              Relationship status
              <select
                value={s.status}
                onChange={(e) =>
                  setStages(
                    stages.map((r, j) =>
                      i === j
                        ? { ...r, status: e.target.value as AccountSalesStatus }
                        : r,
                    ),
                  )
                }
              >
                {Object.values(AccountSalesStatus).map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="secondary"
              disabled={i === 0}
              onClick={() => move(i, -1)}
            >
              Earlier
            </button>
            <button
              type="button"
              className="secondary"
              disabled={i === stages.length - 1}
              onClick={() => move(i, 1)}
            >
              Later
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => setStages(stages.filter((_, j) => i !== j))}
            >
              Remove stage
            </button>
          </fieldset>
        ))}
        <button
          type="button"
          className="secondary"
          disabled={stages.length >= 20}
          onClick={() =>
            setStages([
              ...stages,
              { id: crypto.randomUUID(), name: "", status: "ENGAGED" },
            ])
          }
        >
          Add stage
        </button>
      </CrmForm>
    </details>
  );
}
