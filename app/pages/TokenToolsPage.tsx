import { useState } from "react";
import type { JSX } from "react";
import { CLOUDFLARE_PERMISSION_GROUP_NAMES } from "../lib/cloudflare-permission-groups.ts";
import {
  comparePolicies,
  type ComparisonResult,
  type ParsedTokenPayload,
  parseTokenPayload,
  renderChecklist,
  toReusablePayload,
} from "../lib/token-permissions.ts";

// Not covered by docs/design.zip's own reference screens (constitution's
// Design System section) — this page is a new screen designed in the
// same visual language (tokens, layout conventions from OverviewPage.tsx/
// AlertBanner.tsx), noted explicitly here and in this feature's PR.
//
// The one property every element on this page must have, verified by
// tests/e2e/token-tools.spec.ts (spec.md FR-005/FR-007): nothing pasted
// here is ever sent anywhere. This file imports only pure functions from
// ../lib/token-permissions.ts — no `fetch` call anywhere below.
export function TokenToolsPage(): JSX.Element {
  const [mode, setMode] = useState<"reuse" | "compare">("reuse");

  return (
    <div style={{ padding: "16px 18px" }}>
      <h1
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "var(--text-display-size)",
          fontWeight: "var(--text-display-weight)" as unknown as number,
          letterSpacing: "var(--text-display-ls)",
          margin: "0 0 16px",
        }}
      >
        Token Tools
      </h1>

      <div
        style={{
          border: "1px solid var(--border)",
          background: "var(--surface-1)",
          padding: "10px 14px",
          fontSize: "var(--text-code-size)",
          color: "var(--fg-muted)",
          lineHeight: 1.55,
          marginBottom: 16,
        }}
      >
        This tool only reformats and compares what you paste below — it never reads or creates
        anything in your Cloudflare account, and never sends what you paste anywhere. Everything
        happens in your browser and is discarded when you leave this page.
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <ModeButton active={mode === "reuse"} onClick={() => setMode("reuse")}>
          Reuse a token's permissions
        </ModeButton>
        <ModeButton active={mode === "compare"} onClick={() => setMode("compare")}>
          Compare two tokens
        </ModeButton>
      </div>

      {mode === "reuse" ? <ReuseMode /> : <CompareMode />}
    </div>
  );
}

function ModeButton(
  { active, onClick, children }: { active: boolean; onClick: () => void; children: string },
): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-label-size)",
        letterSpacing: "0.06em",
        padding: "6px 12px",
        cursor: "pointer",
        background: active ? "var(--brand-wash)" : "transparent",
        color: active ? "var(--brand-primary)" : "var(--fg-muted)",
        border: `1px solid ${active ? "var(--brand-edge)" : "var(--border)"}`,
      }}
    >
      {children}
    </button>
  );
}

function PasteInput(
  { label, value, onChange }: { label: string; value: string; onChange: (v: string) => void },
): JSX.Element {
  return (
    <label
      style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}
    >
      <span
        style={{ fontSize: "var(--text-meta-size)", color: "var(--fg-faint)", fontWeight: 600 }}
      >
        {label}
      </span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={8}
        placeholder='Paste a token permission payload, e.g. { "policies": [...] }'
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--text-code-size)",
          background: "var(--bg-base)",
          color: "var(--fg-primary)",
          border: "1px solid var(--border)",
          padding: "8px 10px",
          resize: "vertical",
        }}
      />
    </label>
  );
}

function ErrorMessage({ error }: { error: string }): JSX.Element {
  return (
    <div
      style={{
        color: "var(--status-critical-fg)",
        fontSize: "var(--text-code-size)",
        marginBottom: 12,
      }}
    >
      {error}
    </div>
  );
}

function ReuseMode(): JSX.Element {
  const [input, setInput] = useState("");
  const result = input.trim() ? parseTokenPayload(input) : null;

  return (
    <div>
      <PasteInput label="Source token permission payload" value={input} onChange={setInput} />

      {result && !result.ok && <ErrorMessage error={result.error} />}

      {result && result.ok && <ReuseOutput policies={result.policies} />}
    </div>
  );
}

function ReuseOutput({ policies }: { policies: ParsedTokenPayload }): JSX.Element {
  const checklist = renderChecklist(policies);
  const reusablePayload = JSON.stringify(toReusablePayload(policies), null, 2);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <div>
        <div
          style={{
            fontSize: "var(--text-meta-size)",
            color: "var(--fg-faint)",
            fontWeight: 600,
            marginBottom: 6,
          }}
        >
          Permissions checklist
        </div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: "var(--text-code-size)" }}>
          {checklist.map((item) => (
            <li
              key={item.id}
              style={{
                color: item.recognized ? "var(--fg-primary)" : "var(--status-warning)",
                fontFamily: item.recognized ? "var(--font-sans)" : "var(--font-mono)",
                marginBottom: 4,
              }}
            >
              {item.name}
              {!item.recognized && " (unrecognized permission group)"}
            </li>
          ))}
        </ul>
      </div>
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span
          style={{
            fontSize: "var(--text-meta-size)",
            color: "var(--fg-faint)",
            fontWeight: 600,
          }}
        >
          Payload to paste into Cloudflare's token-creation flow
        </span>
        <textarea
          readOnly
          value={reusablePayload}
          rows={12}
          style={{
            width: "100%",
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-code-size)",
            background: "var(--bg-base)",
            color: "var(--fg-primary)",
            border: "1px solid var(--border)",
            padding: "8px 10px",
          }}
        />
      </label>
    </div>
  );
}

function CompareMode(): JSX.Element {
  const [inputA, setInputA] = useState("");
  const [inputB, setInputB] = useState("");
  const resultA = inputA.trim() ? parseTokenPayload(inputA) : null;
  const resultB = inputB.trim() ? parseTokenPayload(inputB) : null;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <PasteInput label="Token A permission payload" value={inputA} onChange={setInputA} />
        <PasteInput label="Token B permission payload" value={inputB} onChange={setInputB} />
      </div>

      {resultA && !resultA.ok && <ErrorMessage error={`Token A: ${resultA.error}`} />}
      {resultB && !resultB.ok && <ErrorMessage error={`Token B: ${resultB.error}`} />}

      {resultA?.ok && resultB?.ok && (
        <CompareOutput result={comparePolicies(resultA.policies, resultB.policies)} />
      )}
    </div>
  );
}

function CompareOutput({ result }: { result: ComparisonResult }): JSX.Element {
  const allMatch = result.permissionGroups.matches && result.resources.matches;

  if (allMatch) {
    return (
      <div
        style={{
          color: "var(--status-safe)",
          fontSize: "var(--text-body-size)",
          fontWeight: 600,
        }}
      >
        These tokens match — same permission groups, same resource scoping.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ color: "var(--status-warning)", fontWeight: 600 }}>
        These tokens differ:
      </div>
      <DimensionDiff
        title="Permission groups"
        dimension={result.permissionGroups}
        resolveName={(id) => CLOUDFLARE_PERMISSION_GROUP_NAMES[id] ?? id}
      />
      {
        /* Resources are inherently account/zone-specific strings, not
          permission-group names — no lookup table applies (research.md §3). */
      }
      <DimensionDiff title="Resources" dimension={result.resources} />
    </div>
  );
}

function DimensionDiff(
  { title, dimension, resolveName }: {
    title: string;
    dimension: { onlyInA: string[]; onlyInB: string[]; matches: boolean };
    resolveName?: (id: string) => string;
  },
): JSX.Element | null {
  if (dimension.matches) return null;
  const label = resolveName ?? ((id: string) => id);

  return (
    <div style={{ fontSize: "var(--text-code-size)" }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{title} differ:</div>
      {dimension.onlyInA.length > 0 && (
        <div>Only in Token A: {dimension.onlyInA.map(label).join(", ")}</div>
      )}
      {dimension.onlyInB.length > 0 && (
        <div>Only in Token B: {dimension.onlyInB.map(label).join(", ")}</div>
      )}
    </div>
  );
}
