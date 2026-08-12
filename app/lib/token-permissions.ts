// Pure parse/render/diff functions for the Clone API Token Permissions tool
// (specs/011-clone-token-permissions/, contracts/parser.md, data-model.md).
// No I/O anywhere in this file, ever — that's the entire point of this
// feature (spec.md FR-005/FR-006): FlareTower must never call the
// Cloudflare API to read or create tokens, so nothing here is allowed to.

import { CLOUDFLARE_PERMISSION_GROUP_NAMES } from "./cloudflare-permission-groups.ts";

export interface ParsedPolicy {
  effect: "allow" | "deny";
  permissionGroups: { id: string; name?: string }[];
  resources: Record<string, string>;
}

export type ParsedTokenPayload = ParsedPolicy[];

export interface ChecklistItem {
  id: string;
  name: string;
  recognized: boolean;
}

export interface ComparisonDimension {
  onlyInA: string[];
  onlyInB: string[];
  matches: boolean;
}

export interface ComparisonResult {
  permissionGroups: ComparisonDimension;
  resources: ComparisonDimension;
}

export type ParseResult =
  | { ok: true; policies: ParsedTokenPayload }
  | { ok: false; error: string };

export function parseTokenPayload(input: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(input);
  } catch {
    return { ok: false, error: "Not valid JSON — check the pasted text for typos or truncation." };
  }

  if (raw === null || typeof raw !== "object" || !("policies" in raw)) {
    return {
      ok: false,
      error: 'Expected an object with a "policies" array — this doesn\'t look like a Cloudflare ' +
        "token permission payload.",
    };
  }

  const policiesRaw = (raw as { policies: unknown }).policies;
  if (!Array.isArray(policiesRaw) || policiesRaw.length === 0) {
    return { ok: false, error: '"policies" must be a non-empty array.' };
  }

  const policies: ParsedPolicy[] = [];
  for (let i = 0; i < policiesRaw.length; i++) {
    const policy = policiesRaw[i];
    if (policy === null || typeof policy !== "object") {
      return { ok: false, error: `policies[${i}] is not an object.` };
    }
    const { effect, permission_groups, resources } = policy as Record<string, unknown>;
    if (effect !== "allow" && effect !== "deny") {
      return { ok: false, error: `policies[${i}].effect must be "allow" or "deny".` };
    }
    if (!Array.isArray(permission_groups)) {
      return { ok: false, error: `policies[${i}].permission_groups must be an array.` };
    }
    if (resources === null || typeof resources !== "object" || Array.isArray(resources)) {
      return { ok: false, error: `policies[${i}].resources must be an object.` };
    }

    const permissionGroups: { id: string; name?: string }[] = [];
    for (let j = 0; j < permission_groups.length; j++) {
      const group = permission_groups[j];
      if (
        group === null || typeof group !== "object" ||
        typeof (group as { id?: unknown }).id !== "string"
      ) {
        return {
          ok: false,
          error: `policies[${i}].permission_groups[${j}] must have a string "id".`,
        };
      }
      const name = (group as { name?: unknown }).name;
      permissionGroups.push({
        id: (group as { id: string }).id,
        name: typeof name === "string" ? name : undefined,
      });
    }

    policies.push({
      effect,
      permissionGroups,
      resources: resources as Record<string, string>,
    });
  }

  return { ok: true, policies };
}

export function renderChecklist(policies: ParsedTokenPayload): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  for (const policy of policies) {
    for (const group of policy.permissionGroups) {
      const resolved = group.name ?? CLOUDFLARE_PERMISSION_GROUP_NAMES[group.id];
      items.push({
        id: group.id,
        name: resolved ?? group.id,
        recognized: resolved !== undefined,
      });
    }
  }
  return items;
}

export function toReusablePayload(policies: ParsedTokenPayload): unknown {
  return {
    policies: policies.map((policy) => ({
      effect: policy.effect,
      permission_groups: policy.permissionGroups.map((g) => ({ id: g.id })),
      resources: policy.resources,
    })),
  };
}

function flattenPermissionGroupIds(policies: ParsedTokenPayload): Set<string> {
  const ids = new Set<string>();
  for (const policy of policies) {
    for (const group of policy.permissionGroups) {
      ids.add(group.id);
    }
  }
  return ids;
}

function flattenResourceEntries(policies: ParsedTokenPayload): Map<string, string> {
  const entries = new Map<string, string>();
  for (const policy of policies) {
    for (const [key, value] of Object.entries(policy.resources)) {
      entries.set(key, value);
    }
  }
  return entries;
}

function diffSets(a: Set<string>, b: Set<string>): { onlyInA: string[]; onlyInB: string[] } {
  return {
    onlyInA: [...a].filter((id) => !b.has(id)).sort(),
    onlyInB: [...b].filter((id) => !a.has(id)).sort(),
  };
}

function diffMaps(
  a: Map<string, string>,
  b: Map<string, string>,
): { onlyInA: string[]; onlyInB: string[] } {
  const onlyInA: string[] = [];
  const onlyInB: string[] = [];
  for (const [key, value] of a) {
    if (b.get(key) !== value) onlyInA.push(key);
  }
  for (const [key, value] of b) {
    if (a.get(key) !== value) onlyInB.push(key);
  }
  return { onlyInA: onlyInA.sort(), onlyInB: onlyInB.sort() };
}

export function comparePolicies(a: ParsedTokenPayload, b: ParsedTokenPayload): ComparisonResult {
  const groupsDiff = diffSets(flattenPermissionGroupIds(a), flattenPermissionGroupIds(b));
  const resourcesDiff = diffMaps(flattenResourceEntries(a), flattenResourceEntries(b));

  return {
    permissionGroups: {
      ...groupsDiff,
      matches: groupsDiff.onlyInA.length === 0 && groupsDiff.onlyInB.length === 0,
    },
    resources: {
      ...resourcesDiff,
      matches: resourcesDiff.onlyInA.length === 0 && resourcesDiff.onlyInB.length === 0,
    },
  };
}
