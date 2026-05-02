import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import dotenv from "dotenv";

import {
  DEPLOY_TARGETS,
  VERCEL_ORG_ID,
  assertTargetConfigured,
  getDeployTarget,
} from "./deploy-demo";

const target = getDeployTarget(process.argv[2]);
assertTargetConfigured(target);

const demoDir = path.resolve(import.meta.dirname, "..");
const config = DEPLOY_TARGETS[target];
const envPath = path.join(demoDir, config.envFile);

if (!fs.existsSync(envPath)) {
  throw new Error(`Missing ${config.envFile}`);
}

const values = dotenv.parse(fs.readFileSync(envPath));
if (Object.keys(values).length === 0) {
  throw new Error(`${config.envFile} contains no env vars`);
}

function runVercel(args: string[], input?: string): void {
  const result = spawnSync("bunx", ["vercel", ...args], {
    cwd: demoDir,
    encoding: "utf8",
    env: {
      ...process.env,
      VERCEL_ORG_ID,
      VERCEL_PROJECT_ID: config.projectId,
    },
    input,
    stdio: "pipe",
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }

  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  if (result.status !== 0) {
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    if (
      args[0] === "env" &&
      args[1] === "rm" &&
      /(not found|does not exist|could not find|missing)/i.test(output)
    ) {
      return;
    }
    throw new Error(`vercel ${args.join(" ")} failed\n${output.trim()}`);
  }
}

console.log(`Syncing ${config.envFile} to ${config.projectName}`);

for (const [key, value] of Object.entries(values)) {
  console.log(`Updating ${key}`);
  runVercel(["env", "rm", key, "production", "--yes"]);
  runVercel(["env", "add", key, "production"], value);
}

console.log(`Synced ${String(Object.keys(values).length)} env vars to ${config.projectName}`);
