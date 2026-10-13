// OUTER policy transcribed from the P4 staged adapter's build_identity
// contract (agree/agree_for_profile) and the native stage_wire_abi generator
// (p4_llama_compat::stage_wire_abi). The only wire family this adapter speaks
// is p4pb6le64 (P4LB v5, P4PB v6/v7 carrying the verification confirmed count);
// earlier families are refused before LOAD, never read as c = 1.
// Older runtimes retain the exact-build default.
const SUPPORTED_WIRE_ABI_PATTERN = /^p4pb6le64:[a-fA-F0-9]{64}:types=(.+)$/;
const wireTypesWellFormed = (types: string): boolean =>
  types.startsWith("0/1/4,1/1/2,") && types.split(",").every((entry, index) => new RegExp(`^${index}/\\d+/\\d+$`).test(entry));
export const supportedWireAbi = (value: unknown): boolean =>
  typeof value === "string" && (() => { const match = SUPPORTED_WIRE_ABI_PATTERN.exec(value); return !!match && wireTypesWellFormed(match[1]!); })();
export function checkBuilds(identities: Record<string, unknown>[], profile = "exact-build"): void {
  const known = (v: unknown) => typeof v === "string" && v.length > 0 && !["unknown", "unidentified", "none"].includes(v);
  if (!identities.length || identities.some(v => ["upstream_commit", "patch_set", "backend_inventory"].some(k => !known(v[k])))) throw new Error("Loaded nodes must identify their builds");
  // P4 refuses an unsupported native wire under every policy, including
  // ExactBuild: a stage that names a wire family this adapter does not speak
  // is refused before agreement, while a stage too old to name its wire is
  // left to its own worker LOAD refusal.
  if (identities.some(v => known(v.stage_wire_abi) && !supportedWireAbi(v.stage_wire_abi))) throw new Error("Loaded nodes report a native wire ABI this adapter does not speak");
  const fields = ["upstream_commit", "patch_set", profile === "physical-wire-v4" ? "stage_wire_abi" : "backend_inventory"];
  if (profile === "physical-wire-v4" && identities.some(v => !supportedWireAbi(v.stage_wire_abi))) throw new Error("Physical wire compatibility requires an identified native ABI on every node");
  for (const field of fields) if (identities.some(v => v[field] !== identities[0]![field])) throw new Error(`Loaded nodes do not agree on identified ${field}`);
}
