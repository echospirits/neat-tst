"use client";
import { useState } from "react";
import { CrmForm } from "../../components/CrmForm";
import { RecordPicker } from "../../components/RecordPicker";
import type { AccountConfiguration } from "../../../lib/crm/accountConfiguration";
import { saveAccountConfigurationAction } from "../../account-memory/metadata-actions";
export function AccountConfigurationEditor({
  configuration,
  users,
}: {
  configuration: AccountConfiguration;
  users: Array<{ id: string; name: string }>;
}) {
  const [c, setC] = useState(configuration),
    [search, setSearch] = useState("");
  return (
    <details className="card">
      <summary>Territories, teams, and account fields</summary>
      <CrmForm
        action={saveAccountConfigurationAction}
        submitLabel="Save account settings"
      >
        <input name="configuration" type="hidden" value={JSON.stringify(c)} />
        <h3>Territories</h3>
        <p className="field-note">
          Comma-separated state codes, county names and postal codes suggest
          matching territories. Accounts are assigned explicitly. No boundary
          polygon is inferred.
        </p>
        {c.territories.map((t, i) => (
          <fieldset className="card" key={t.id}>
            <legend>{t.name || `Territory ${i + 1}`}</legend>
            {(["name", "states", "counties", "postalCodes"] as const).map(
              (key) => (
                <label key={key}>
                  {
                    {
                      name: "Name",
                      states: "State codes",
                      counties: "Counties",
                      postalCodes: "Postal codes",
                    }[key]
                  }
                  <input
                    value={t[key]}
                    maxLength={
                      key === "name" ? 100 : key === "states" ? 200 : 2000
                    }
                    onChange={(e) =>
                      setC({
                        ...c,
                        territories: c.territories.map((row, j) =>
                          j === i ? { ...row, [key]: e.target.value } : row,
                        ),
                      })
                    }
                  />
                </label>
              ),
            )}
            <RecordPicker
              name={`owner-${t.id}`}
              label="Territory owner"
              options={users.map((u) => ({ value: u.id, label: u.name }))}
              defaultValue={t.ownerUserId}
              onChange={(id) =>
                setC({
                  ...c,
                  territories: c.territories.map((row, j) =>
                    j === i ? { ...row, ownerUserId: id } : row,
                  ),
                })
              }
            />
            <button
              className="secondary"
              type="button"
              onClick={() =>
                setC({
                  ...c,
                  territories: c.territories.filter((_, j) => j !== i),
                })
              }
            >
              Remove territory
            </button>
          </fieldset>
        ))}
        <button
          className="secondary"
          type="button"
          disabled={c.territories.length >= 50}
          onClick={() =>
            setC({
              ...c,
              territories: [
                ...c.territories,
                {
                  id: crypto.randomUUID(),
                  name: "",
                  states: "",
                  counties: "",
                  postalCodes: "",
                  ownerUserId: "",
                },
              ],
            })
          }
        >
          Add territory
        </button>
        <h3>Teams</h3>
        <label>
          Find team members
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {c.teams.map((t, i) => (
          <fieldset className="card" key={t.id}>
            <legend>{t.name || `Team ${i + 1}`}</legend>
            <label>
              Team name
              <input
                value={t.name}
                maxLength={100}
                onChange={(e) =>
                  setC({
                    ...c,
                    teams: c.teams.map((row, j) =>
                      j === i ? { ...row, name: e.target.value } : row,
                    ),
                  })
                }
              />
            </label>
            {users
              .filter((u) =>
                u.name.toLowerCase().includes(search.toLowerCase()),
              )
              .map((u) => (
                <label key={u.id}>
                  <input
                    type="checkbox"
                    checked={t.memberIds.includes(u.id)}
                    onChange={(e) =>
                      setC({
                        ...c,
                        teams: c.teams.map((row, j) =>
                          j === i
                            ? {
                                ...row,
                                memberIds: e.target.checked
                                  ? [...row.memberIds, u.id]
                                  : row.memberIds.filter((id) => id !== u.id),
                              }
                            : row,
                        ),
                      })
                    }
                  />
                  {u.name}
                </label>
              ))}
            <button
              className="secondary"
              type="button"
              onClick={() =>
                setC({ ...c, teams: c.teams.filter((_, j) => j !== i) })
              }
            >
              Remove team
            </button>
          </fieldset>
        ))}
        <button
          className="secondary"
          type="button"
          disabled={c.teams.length >= 30}
          onClick={() =>
            setC({
              ...c,
              teams: [
                ...c.teams,
                { id: crypto.randomUUID(), name: "", memberIds: [] },
              ],
            })
          }
        >
          Add team
        </button>
        <h3>Custom account categories</h3>
        {c.categories.map((f, i) => (
          <div className="form-grid" key={f.id}>
            <label>
              Category name
              <input
                value={f.name}
                maxLength={100}
                onChange={(e) =>
                  setC({
                    ...c,
                    categories: c.categories.map((row, j) =>
                      j === i ? { ...row, name: e.target.value } : row,
                    ),
                  })
                }
              />
            </label>
            <button
              type="button"
              className="secondary"
              onClick={() =>
                setC({
                  ...c,
                  categories: c.categories.filter((_, j) => j !== i),
                })
              }
            >
              Remove category
            </button>
          </div>
        ))}
        <button
          type="button"
          className="secondary"
          disabled={c.categories.length >= 30}
          onClick={() =>
            setC({
              ...c,
              categories: [
                ...c.categories,
                { id: crypto.randomUUID(), name: "" },
              ],
            })
          }
        >
          Add account category
        </button>
        <h3>Custom account fields</h3>
        {c.fields.map((f, i) => (
          <div className="form-grid" key={f.id}>
            <label>
              Field name
              <input
                value={f.name}
                maxLength={100}
                onChange={(e) =>
                  setC({
                    ...c,
                    fields: c.fields.map((row, j) =>
                      j === i ? { ...row, name: e.target.value } : row,
                    ),
                  })
                }
              />
            </label>
            <label>
              Value type
              <select
                value={f.type}
                onChange={(e) =>
                  setC({
                    ...c,
                    fields: c.fields.map((row, j) =>
                      j === i
                        ? { ...row, type: e.target.value as typeof f.type }
                        : row,
                    ),
                  })
                }
              >
                {["TEXT", "NUMBER", "DATE", "BOOLEAN"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <button
              className="secondary"
              type="button"
              onClick={() =>
                setC({ ...c, fields: c.fields.filter((_, j) => j !== i) })
              }
            >
              Remove field
            </button>
          </div>
        ))}
        <button
          className="secondary"
          type="button"
          disabled={c.fields.length >= 30}
          onClick={() =>
            setC({
              ...c,
              fields: [
                ...c.fields,
                { id: crypto.randomUUID(), name: "", type: "TEXT" },
              ],
            })
          }
        >
          Add field
        </button>
        <p className="field-note">
          Removing a field hides it but retains its recorded values in account
          history. Territories and teams must be unassigned before removal.
        </p>
      </CrmForm>
    </details>
  );
}
