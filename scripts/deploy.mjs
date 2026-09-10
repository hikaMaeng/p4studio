import { spawnSync } from "node:child_process";

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
run("docker", ["compose", "up", "-d", "--build", "--remove-orphans"]);

const port = Number(process.env.P4STUDIO_PORT);
if (!Number.isInteger(port) || port < 10_000 || port > 59_999) throw new Error("P4STUDIO_PORT must be in 10000..59999");
let health;
for (let attempt = 0; attempt < 30; attempt += 1) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    if (response.ok) { health = await response.json(); break; }
  } catch { /* container may still be starting */ }
  await new Promise((resolve) => setTimeout(resolve, 500));
}
if (health?.status !== "ok") throw new Error("deployed Studio health check failed");
console.log(`deploy-total status=ok service=studio port=${port} health=${health.status} database=${health.database}`);
