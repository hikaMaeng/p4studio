import { spawnSync } from "node:child_process";

const started = performance.now();
const service = process.argv[2] ?? 'studio';
if (!['studio', 'apps/studio'].includes(service)) throw new Error('Expected service studio');
const capture = (args) => {
  const result = spawnSync('docker', args, { encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error(result.stderr || String(result.error));
  return result.stdout.trim();
};

try { process.loadEnvFile(".env"); } catch { /* compose reports a missing env file */ }

const run = (command, args) => {
  const result = process.platform === "win32"
    ? spawnSync(`${command} ${args.join(" ")}`, { stdio: "inherit", shell: true })
    : spawnSync(command, args, { stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};

run("npm", ["ci"]);
run("npm", ["run", "build"]);
run("docker", ["compose", "config", "--quiet"]);
run("docker", ["compose", "up", "-d", "--build", "--remove-orphans"]);

// Old empty bridges can retain a route that shadows the physical agent LAN.
for (const name of ['p4studio_studio-internal', 'p4studio_studio-edge']) {
  const found = capture(['network', 'ls', '--filter', `name=^${name}$`, '--format', '{{.ID}}']);
  if (!found) continue;
  const [network] = JSON.parse(capture(['network', 'inspect', name]));
  if (network.Labels?.['com.docker.compose.project'] === 'p4studio' && Object.keys(network.Containers ?? {}).length === 0) {
    run('docker', ['network', 'rm', name]);
  }
}

const port = Number(process.env.P4STUDIO_PORT);
if (!Number.isInteger(port) || port < 10_000 || port > 59_999) throw new Error("P4STUDIO_PORT must be in 10000..59999");
let health;
const published = capture(['compose', 'port', 'studio', String(port)]);
if (!published.split('\n').some(line => line.endsWith(`:${port}`))) throw new Error('published-port-invalid');
const containerId = capture(['compose', 'ps', '-q', 'studio']);
const [container] = JSON.parse(capture(['inspect', containerId]));
// See apps/studio/docs/usage.md#persistent-storage. Never accept an ephemeral DB.
const dataMount = container.Mounts.find(mount => mount.Destination === '/app/data');
if (dataMount?.Type !== 'volume' || dataMount.Name !== 'p4studio_studio-data' || !dataMount.RW) {
  throw new Error('persistent-volume-missing: expected writable p4studio_studio-data at /app/data');
}
const sqlitePath = container.Config.Env.find(value => value.startsWith('P4STUDIO_SQLITE_PATH='))?.slice('P4STUDIO_SQLITE_PATH='.length);
if (sqlitePath !== '/app/data/p4studio.db') throw new Error('sqlite-path-outside-persistent-volume');
for (let attempt = 0; attempt < 30; attempt += 1) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    if (response.ok) { health = await response.json(); break; }
  } catch { /* container may still be starting */ }
  await new Promise((resolve) => setTimeout(resolve, 500));
}
if (health?.status !== "ok") throw new Error("deployed Studio health check failed");
if (health.instance !== container.Config.Hostname) throw new Error('published-port-instance-mismatch: another server is answering the Docker port');
console.log(`deploy-total status=ok service=studio port=${port} health=${health.status} database=${health.database}`);
console.log(`deploy-report-begin\nresult: status=ok services=studio compose=refreshed\ntime: total=${Math.round(performance.now() - started)}ms\nverify: service=studio port=${port} health=ok instance=${health.instance} volume=${dataMount.Name} sqlite=${sqlitePath}\nchanged: Studio image refreshed; persistent data volume retained\ndeploy-report-end`);
