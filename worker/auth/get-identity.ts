// Best-effort IdP enrichment (constitution Principle II: "an enrichment
// step, never a substitute for JWT validation" — research.md §2). Any
// failure here must never affect an authentication decision, so every
// error path returns "unknown" rather than throwing.
export async function fetchIdentityProvider(teamDomain: string, jwt: string): Promise<string> {
  try {
    const res = await fetch(`${teamDomain}/cdn-cgi/access/get-identity`, {
      headers: { Cookie: `CF_Authorization=${jwt}` },
    });
    if (!res.ok) return "unknown";

    const data = await res.json() as { idp?: { type?: unknown } };
    const idpType = data.idp?.type;
    return typeof idpType === "string" && idpType.length > 0 ? idpType : "unknown";
  } catch {
    return "unknown";
  }
}
