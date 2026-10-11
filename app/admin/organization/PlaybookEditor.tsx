"use client";
import { useState } from "react";
import { CrmForm } from "../../components/CrmForm";
import { savePlaybookAction } from "../../account-memory/playbook-actions";
type Step = { title: string; day: number; detail: string };
export function PlaybookEditor({
  template,
}: {
  template?: {
    id: string;
    name: string;
    version: number;
    active: boolean;
    steps: Step[];
  };
}) {
  const [steps, setSteps] = useState(
    template?.steps ?? [{ title: "", day: 0, detail: "" }],
  );
  return (
    <details className="task-context">
      <summary>{template?.name ?? "Create a playbook"}</summary>
      <CrmForm action={savePlaybookAction} submitLabel="Save playbook">
        <input type="hidden" name="id" value={template?.id ?? ""} />
        <input type="hidden" name="version" value={template?.version ?? 0} />
        <label>
          Name
          <input
            name="name"
            maxLength={100}
            required
            defaultValue={template?.name}
          />
        </label>
        <label>
          <input
            name="active"
            type="checkbox"
            defaultChecked={template?.active ?? true}
          />
          Available to the team
        </label>
        {steps.map((step, i) => (
          <fieldset key={i} className="card">
            <legend>Step {i + 1}</legend>
            <label>
              Task title
              <input
                required
                name="stepTitle"
                maxLength={180}
                value={step.title}
                onChange={(e) =>
                  setSteps(
                    steps.map((s, j) =>
                      i === j ? { ...s, title: e.target.value } : s,
                    ),
                  )
                }
              />
            </label>
            <label>
              Days after start
              <input
                name="stepDay"
                type="number"
                min={0}
                max={365}
                required
                value={step.day}
                onChange={(e) =>
                  setSteps(
                    steps.map((s, j) =>
                      i === j ? { ...s, day: Number(e.target.value) } : s,
                    ),
                  )
                }
              />
            </label>
            <label>
              Instructions (optional)
              <textarea
                name="stepDetail"
                maxLength={2000}
                value={step.detail}
                onChange={(e) =>
                  setSteps(
                    steps.map((s, j) =>
                      i === j ? { ...s, detail: e.target.value } : s,
                    ),
                  )
                }
              />
            </label>
            <button
              type="button"
              className="secondary"
              disabled={steps.length === 1}
              onClick={() => setSteps(steps.filter((_, j) => j !== i))}
            >
              Remove step {i + 1}
            </button>
          </fieldset>
        ))}
        <button
          type="button"
          className="secondary"
          disabled={steps.length >= 12}
          onClick={() =>
            setSteps([
              ...steps,
              { title: "", day: steps.at(-1)?.day ?? 0, detail: "" },
            ])
          }
        >
          Add step
        </button>
      </CrmForm>
    </details>
  );
}
