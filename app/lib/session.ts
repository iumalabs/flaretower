// spec 028 (contracts/session-probe.md) — a thin client for the one new
// read-only endpoint this feature adds. Callers never need to distinguish
// *why* the probe failed (a real 403 from accessAuth's fail-closed path, a
// network error, a redirect Cloudflare Access itself served instead of
// JSON, a malformed body) — every non-200 outcome means the same thing for
// this feature's purposes: render the public experience, not the
// authenticated one (research.md §1).
export interface SessionIdentity {
  email: string;
  role: "member" | "admin";
}

export async function fetchSession(): Promise<SessionIdentity | null> {
  try {
    const res = await fetch("/api/identity/session");
    if (!res.ok) {
      return null;
    }
    const body = await res.json();
    if (
      typeof body !== "object" || body === null ||
      typeof (body as { email?: unknown }).email !== "string" ||
      ((body as { role?: unknown }).role !== "member" &&
        (body as { role?: unknown }).role !== "admin")
    ) {
      return null;
    }
    return body as SessionIdentity;
  } catch {
    return null;
  }
}
