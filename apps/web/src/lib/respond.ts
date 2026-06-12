import { NextResponse } from "next/server";
import type { z } from "zod";

export function ok(data: unknown, init?: number): NextResponse {
  return NextResponse.json(data, { status: init ?? 200 });
}

export function fail(code: string, message: string, status: number): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function parseBody<S extends z.ZodTypeAny>(
  req: Request,
  schema: S,
): Promise<{ data: z.output<S> } | { response: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { response: fail("bad_json", "request body must be JSON", 400) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      response: fail(
        "validation",
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        422,
      ),
    };
  }
  return { data: parsed.data };
}
