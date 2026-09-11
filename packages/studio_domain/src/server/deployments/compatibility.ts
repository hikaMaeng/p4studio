// OUTER policy transcribed from the HY3 fleet's agree_for_profile contract.
// Older runtimes retain the exact-build default.
export function checkBuilds(identities: Record<string, unknown>[], profile = "exact-build"): void {
  const known = (v: unknown) => typeof v === "string" && v.length > 0 && !["unknown", "unidentified", "none"].includes(v);
  if (!identities.length || identities.some(v => ["upstream_commit", "patch_set", "backend_inventory"].some(k => !known(v[k])))) throw new Error("Loaded nodes must identify their builds");
  const fields = ["upstream_commit", "patch_set", profile === "physical-wire-v4" ? "stage_wire_abi" : "backend_inventory"];
  if (profile === "physical-wire-v4" && identities.some(v => {
    if (typeof v.stage_wire_abi !== "string") return true;
    const match = /^p4pb4le64:[a-fA-F0-9]{64}:types=(.+)$/.exec(v.stage_wire_abi);
    return !match || !match[1]!.startsWith("0/1/4,1/1/2,") || match[1]!.split(",").some((entry, index) => !new RegExp(`^${index}/\\d+/\\d+$`).test(entry));
  })) throw new Error("Physical wire v4 requires an identified native ABI on every node");
  for (const field of fields) if (identities.some(v => v[field] !== identities[0]![field])) throw new Error(`Loaded nodes do not agree on identified ${field}`);
}
