import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

// Generic Docker Compose deployment entrypoint.
// Usage: node scripts/deploy.mjs [service] [--health-path=/health] [--force]
const startedAt = performance.now();
const timings = new Map();
const args = process.argv.slice(2);
const serviceArg = args.find(value => !value.startsWith("--"));
const option = name => args.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const healthPath = option("health-path") ?? process.env.DEPLOY_HEALTH_PATH ?? "/health";
const force = args.includes("--force");
const healthTimeoutMs = Number(option("health-timeout-ms") ?? process.env.DEPLOY_HEALTH_TIMEOUT_MS ?? 5000);
const root = process.cwd();
const composeFile = option("compose-file") ?? process.env.COMPOSE_FILE ?? "docker-compose.yml";
const cacheFile = join(tmpdir(), `compose-deploy-${hash(resolve(root, composeFile)).slice(0, 16)}.json`);

function hash(value) { return createHash("sha256").update(value).digest("hex"); }
function phase(name, status, extra = {}) { console.log(`deploy-phase phase=${name} status=${status} elapsed_ms=${Math.round(timings.get(name) ?? 0)}${Object.entries(extra).map(([key, value]) => ` ${key}=${String(value).replaceAll(" ", "_")}`).join("")}`); }
function measure(name, before) { timings.set(name, performance.now() - before); }
function executable(name) { return name; }
function command(name, commandArgs, options = {}) {
  const result = spawnSync(executable(name), commandArgs, { cwd: root, encoding: "utf8", shell: process.platform === "win32" && ["npm", "pnpm", "yarn"].includes(name), stdio: options.inherit ? "inherit" : ["ignore", "pipe", "pipe"] });
  if (result.error || result.status !== 0) throw new Error((result.stderr || result.stdout || result.error?.message || `${name} failed`).trim());
  return result.stdout?.trim() ?? "";
}
function commandJson(name, commandArgs) { const output = command(name, commandArgs); try { return JSON.parse(output); } catch { throw new Error(`invalid-json-from-${name}`); } }
function compose(...composeArgs) { return command("docker", ["compose", "-f", composeFile, ...composeArgs]); }
function composeJson(...composeArgs) { return commandJson("docker", ["compose", "-f", composeFile, ...composeArgs]); }
function newestMtime(path, ignored = new Set([".git", "node_modules", "dist", "target", ".turbo", "docker"])) {
  if (!existsSync(path)) return 0;
  const info = statSync(path); if (!info.isDirectory()) return info.mtimeMs;
  return Math.max(info.mtimeMs, ...readdirSync(path, { withFileTypes: true }).filter(entry => !ignored.has(entry.name)).map(entry => newestMtime(join(path, entry.name), ignored)));
}
function dependencyCommand() {
  const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const declared = String(packageJson.packageManager ?? "").split("@")[0];
  if (declared === "pnpm" || existsSync(join(root, "pnpm-lock.yaml"))) return ["pnpm", ["install", "--frozen-lockfile"]];
  if (declared === "yarn" || existsSync(join(root, "yarn.lock"))) return ["yarn", ["install", "--immutable"]];
  if (declared === "bun" || existsSync(join(root, "bun.lockb")) || existsSync(join(root, "bun.lock"))) return ["bun", ["install", "--frozen-lockfile"]];
  return ["npm", ["ci"]];
}
function needsDependencies() {
  if (!existsSync(join(root, "node_modules"))) return true;
  const marker = join(root, "node_modules", ".package-lock.json");
  const manifests = ["package.json", "package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb"].map(name => join(root, name));
  return !existsSync(marker) || manifests.some(path => existsSync(path) && statSync(path).mtimeMs > statSync(marker).mtimeMs);
}
function readCache() { try { return JSON.parse(readFileSync(cacheFile, "utf8")); } catch { return {}; } }
function writeCache(value) { try { writeFileSync(cacheFile, JSON.stringify(value)); } catch { /* cache is an optimization */ } }

let service;
let composeConfig;
let published;
let refresh = "refreshed";
const report = { status: "failed", compose: "failed", verify: "failed", changed: "unknown" };

function printReport() {
  const total = Math.round(performance.now() - startedAt);
  console.log(`deploy-summary service=${service ?? "unknown"} refresh=${refresh} port=${published?.port ?? "none"} port_reason=${published?.reason ?? "unknown"} health[${healthPath}]=${report.verify === "ok" ? "ok" : "failed"}`);
  console.log("deploy-report-begin");
  console.log(`result: status=${report.status} services=${service ?? "unknown"} compose=${report.compose}`);
  console.log(`time: total=${total}ms resolve=${Math.round(timings.get("resolve") ?? 0)}ms install=${Math.round(timings.get("install") ?? 0)}ms build=${Math.round(timings.get("build") ?? 0)}ms compose=${Math.round(timings.get("compose") ?? 0)}ms verify=${Math.round(timings.get("verify") ?? 0)}ms`);
  console.log(`verify: ${report.verifyDetail ?? "not-run"}`);
  console.log(`changed: ${report.changed}`);
  console.log("deploy-report-end");
}

try {
  let mark = performance.now();
  composeConfig = composeJson("config", "--format", "json");
  const services = Object.keys(composeConfig.services ?? {});
  if (!services.length) throw new Error("compose-service-missing");
  if (serviceArg && !services.includes(serviceArg)) throw new Error(`compose-service-not-found:${serviceArg}`);
  service = serviceArg ?? (services.length === 1 ? services[0] : undefined);
  if (!service) throw new Error(`compose-service-required:${services.join(",")}`);
  measure("resolve", mark); phase("resolve", "ok", { service });

  mark = performance.now();
  if (needsDependencies()) { const [manager, managerArgs] = dependencyCommand(); command(manager, managerArgs, { inherit: true }); report.changed = `dependencies=${manager}`; }
  else report.changed = "dependencies=already-current";
  measure("install", mark); phase("install", "ok");

  mark = performance.now();
  const buildRoot = resolve(root, composeConfig.services[service].build?.context ?? ".");
  const artifactMtime = newestMtime(join(buildRoot, "dist"));
  if (!artifactMtime || newestMtime(buildRoot) > artifactMtime) { const [manager] = dependencyCommand(); command(manager, ["run", "build"], { inherit: true }); report.changed += ",build=executed"; }
  else report.changed += ",build=already-current";
  measure("build", mark); phase("build", "ok");

  mark = performance.now();
  const serviceConfig = composeConfig.services[service];
  const configText = JSON.stringify(serviceConfig);
  const dockerfile = resolve(buildRoot, serviceConfig.build?.dockerfile ?? "Dockerfile");
  const fingerprint = hash(`${configText}\0${newestMtime(buildRoot)}\0${newestMtime(dockerfile, new Set())}\0${newestMtime(join(root, composeFile), new Set())}`);
  const cached = readCache();
  const existingId = compose("ps", "-q", service);
  const imageState = existingId ? commandJson("docker", ["inspect", existingId])[0] : null;
  const expectedInstance = imageState?.Config?.Hostname;
  if (!expectedInstance) throw new Error("container-identity-missing");
  if (!force && cached[service] === fingerprint && imageState?.State?.Running) { refresh = "already-current"; report.compose = "already-current"; }
  else { compose("up", "-d", "--build", "--remove-orphans"); writeCache({ ...cached, [service]: fingerprint }); report.compose = "refreshed"; }
  measure("compose", mark); phase("compose", "ok", { refresh });

  mark = performance.now();
  const mapping = (serviceConfig.ports ?? []).find(value => typeof value === "object" && value.published && value.target);
  if (!mapping) { published = { reason: "published-port-missing" }; throw new Error("published-port-missing"); }
  const actual = compose("port", service, String(mapping.target)).split(/\r?\n/).map(value => value.trim()).find(Boolean);
  const match = actual?.match(/:(\d+)$/);
  if (!match || Number(match[1]) <= 0) { published = { reason: "published-port-invalid" }; throw new Error("published-port-invalid"); }
  published = { port: Number(match[1]), reason: "mapped" };
  const deadline = Date.now() + healthTimeoutMs;
  let health, verifiedHost;
  while (Date.now() < deadline) {
    for (const host of ["127.0.0.1", "localhost"]) {
      try {
        const response = await fetch(`http://${host}:${published.port}${healthPath}`);
        if (!response.ok) continue;
        const candidate = await response.json().catch(() => ({}));
        if (candidate.instance !== expectedInstance) throw new Error(`published-port-owned-by-other-instance:${host}`);
        health = candidate; verifiedHost = host; break;
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("published-port-owned-by-other-instance:")) throw error;
      }
    }
    if (health) break;
    await new Promise(resolveDelay => setTimeout(resolveDelay, 250));
  }
  if (!health) throw new Error("health-check-failed");
  report.status = "ok"; report.verify = "ok"; report.verifyDetail = `service=${service} host=${verifiedHost} port=${published.port} health=ok`;
  console.log(`deploy-total status=ok service=${service} host=${verifiedHost} port=${published.port} health=ok refresh=${refresh}`);
  measure("verify", mark); phase("verify", "ok", { port: published.port });
} catch (error) {
  report.verifyDetail = error instanceof Error ? error.message.replaceAll("\n", " ") : String(error);
  console.error(`deploy-error ${report.verifyDetail}`);
} finally { printReport(); }
if (report.status !== "ok") process.exitCode = 1;
