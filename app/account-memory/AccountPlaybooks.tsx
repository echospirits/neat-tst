"use client";
import { useState } from "react";
import { CrmForm } from "../components/CrmForm";
import { RecordPicker } from "../components/RecordPicker";
import { startPlaybookAction, cancelPlaybookAction } from "./playbook-actions";
export function AccountPlaybooks(props: {
  accountType: "AGENCY" | "WHOLESALE";
  accountId: string;
  currentUserId: string;
  users: Array<{ id: string; name: string }>;
  templates: Array<{
    id: string;
    name: string;
    steps: Array<{ title: string; day: number }>;
  }>;
  runs: Array<{
    id: string;
    name: string;
    open: number;
    complete: number;
    total: number;
  }>;
}) {
  const [selected, setSelected] = useState(""),
    [key, setKey] = useState("");
  const template = props.templates.find((t) => t.id === selected);
  return (
    <details
      className="task-context"
      onToggle={(e) => {
        if (e.currentTarget.open && !key) setKey(crypto.randomUUID());
      }}
    >
      <summary>
        Playbooks{props.runs.length ? ` · ${props.runs.length} runs` : ""}
      </summary>
      {props.runs.map((r) => (
        <div className="card" key={r.id}>
          <strong>{r.name}</strong>
          <p>
            {r.complete} completed · {r.open} outstanding · {r.total} total
            tasks
          </p>
          {r.open ? (
            <CrmForm
              action={cancelPlaybookAction}
              submitLabel="Stop playbook"
              confirm="Cancel only untouched open steps? Completed, started, and edited tasks will be kept."
            >
              <input type="hidden" name="runId" value={r.id} />
            </CrmForm>
          ) : (
            <span className="pill">Finished</span>
          )}
        </div>
      ))}
      {props.templates.length ? (
        <CrmForm
          action={startPlaybookAction}
          submitLabel="Add steps to Worklist"
          onSuccess={() => setKey(crypto.randomUUID())}
        >
          <input type="hidden" name="accountType" value={props.accountType} />
          <input type="hidden" name="accountId" value={props.accountId} />
          <input type="hidden" name="submissionKey" value={key} />
          <RecordPicker
            name="playbookId"
            label="Playbook"
            options={props.templates.map((t) => ({
              value: t.id,
              label: t.name,
            }))}
            allowEmpty={false}
            placeholder="Choose a playbook"
            onChange={setSelected}
          />
          {template ? (
            <ol>
              {template.steps.map((s, i) => (
                <li key={i}>
                  Day {s.day}: {s.title}
                </li>
              ))}
            </ol>
          ) : null}
          <RecordPicker
            name="assignedToUserId"
            label="Task owner"
            options={props.users.map((u) => ({ value: u.id, label: u.name }))}
            defaultValue={props.currentUserId}
            allowEmpty={false}
          />
          <label>
            Start date
            <input
              type="date"
              name="startDate"
              required
              defaultValue={new Date().toLocaleDateString("en-CA")}
            />
          </label>
          <p className="field-note">
            All steps become ordinary Worklist tasks. No messages will be sent
            automatically.
          </p>
        </CrmForm>
      ) : (
        <p className="muted">
          An administrator can add templates in Organization setup.
        </p>
      )}
    </details>
  );
}
