"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [stage, setStage] = useState<"request" | "verify">("request");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function call(path: string, body: unknown) {
    setError(null);
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error?.message ?? `failed (${res.status})`);
      return false;
    }
    return true;
  }

  return (
    <div className="card">
      <h1>Sign in</h1>
      <p className="muted">No password — we&apos;ll send you a six-digit code.</p>
      {stage === "request" ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (await call("/api/auth/request", { email })) setStage("verify");
          }}
        >
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button>Send code</button>
          <p className="muted">Dev environments accept the code 000000.</p>
        </form>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (await call("/api/auth/verify", { email, code })) {
              router.push("/me");
              router.refresh();
            }
          }}
        >
          <label htmlFor="code">Enter the code we sent to {email}</label>
          <input
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            pattern="[0-9]{6}"
            required
          />
          <button>Verify</button>
        </form>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
