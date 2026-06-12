"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Field {
  name: string;
  label: string;
  type?: "text" | "number" | "datetime-local" | "textarea" | "select";
  options?: string[];
  required?: boolean;
  placeholder?: string;
}

/**
 * Tiny JSON form: posts field values to an API route. Numeric fields are sent
 * as numbers; *_cents fields accept dollars in the UI and convert.
 */
export function ApiForm({
  endpoint,
  fields,
  submitLabel,
  redirectTo,
  transform,
}: {
  endpoint: string;
  fields: Field[];
  submitLabel: string;
  redirectTo?: string;
  transform?: string; // name of a built-in transform; serializable for server components
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {};
    for (const f of fields) {
      const raw = String(form.get(f.name) ?? "").trim();
      if (raw === "") continue;
      if (f.name.endsWith("Cents")) body[f.name] = Math.round(Number(raw) * 100);
      else if (f.type === "number") body[f.name] = Number(raw);
      else if (f.type === "datetime-local")
        body[f.name] = new Date(raw).toISOString();
      else body[f.name] = raw;
    }
    if (transform === "genreTagsCsv" && typeof body.genreTags === "string") {
      body.genreTags = (body.genreTags as string)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error?.message ?? `request failed (${res.status})`);
      return;
    }
    if (redirectTo) router.push(redirectTo);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit}>
      {fields.map((f) => (
        <div key={f.name}>
          <label htmlFor={f.name}>{f.label}</label>
          {f.type === "textarea" ? (
            <textarea id={f.name} name={f.name} rows={3} placeholder={f.placeholder} />
          ) : f.type === "select" ? (
            <select id={f.name} name={f.name} required={f.required}>
              {f.options?.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : (
            <input
              id={f.name}
              name={f.name}
              type={f.type === "datetime-local" ? "datetime-local" : f.type ?? "text"}
              required={f.required}
              placeholder={f.placeholder}
            />
          )}
        </div>
      ))}
      {error && <p className="error">{error}</p>}
      <button disabled={busy}>{busy ? "…" : submitLabel}</button>
    </form>
  );
}

/** One-click POST button (apply, accept, cancel). */
export function ActionButton({
  endpoint,
  label,
  body,
}: {
  endpoint: string;
  label: string;
  body?: Record<string, unknown>;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <span>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const res = await fetch(endpoint, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body ?? {}),
          });
          setBusy(false);
          if (!res.ok) {
            const data = await res.json().catch(() => null);
            setError(data?.error?.message ?? `failed (${res.status})`);
            return;
          }
          router.refresh();
        }}
      >
        {busy ? "…" : label}
      </button>
      {error && <span className="error"> {error}</span>}
    </span>
  );
}
