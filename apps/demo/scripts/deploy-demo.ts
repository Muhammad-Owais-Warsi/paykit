import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

export type DeployTarget = "canary" | "prod";

export const DEPLOY_TARGETS = {
  canary: {
    appUrl: "https://canary.paykit.sh",
    envFile: ".env.canary.local",
    projectId: "prj_yE0iPxCyx5cKn9mXTE93tbTHbf0O",
    projectName: "pk-demo-canary",
  },
  prod: {
    appUrl: "https://demo.paykit.sh",
    envFile: ".env.production.local",
    projectId: "TODO_VERCEL_PROD_PROJECT_ID",
    projectName: "demo-prod",
  },
};

export const VERCEL_ORG_ID = "team_aTDm0BA9FeXnYnflix3JVLeS";
const PAYKIT_PACKAGES = ["paykitjs", "@paykitjs/polar", "@paykitjs/stripe"];

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const DEMO_DIR = path.join(REPO_ROOT, "apps/demo");

export function getDeployTarget(value: string | undefined): DeployTarget {
  if (value === "canary" || value === "prod") return value;
  throw new Error("Expected target to be 'canary' or 'prod'");
}

export function assertTargetConfigured(target: DeployTarget): void {
  const config = DEPLOY_TARGETS[target];
  if (VERCEL_ORG_ID.startsWith("TODO_")) {
    throw new Error("Set VERCEL_ORG_ID in apps/demo/scripts/deploy-demo.ts");
  }
  if (config.projectId.startsWith("TODO_")) {
    throw new Error(`Set ${target} projectId in apps/demo/scripts/deploy-demo.ts`);
  }
}

function run(
  command: string,
  args: string[],
  options?: { cwd?: string; env?: Record<string, string> },
): string {
  const result = spawnSync(command, args, {
    cwd: options?.cwd ?? REPO_ROOT,
    encoding: "utf8",
    env: { ...process.env, ...options?.env },
    stdio: ["inherit", "pipe", "inherit"],
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed`);
  }

  return result.stdout.trim();
}

function runInherit(
  command: string,
  args: string[],
  options?: { cwd?: string; env?: Record<string, string> },
): void {
  const result = spawnSync(command, args, {
    cwd: options?.cwd ?? REPO_ROOT,
    env: { ...process.env, ...options?.env },
    stdio: "inherit",
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed`);
  }
}

function assertPackageVersionExists(packageName: string, version: string): void {
  const resolved = run("npm", ["view", `${packageName}@${version}`, "version"]);
  if (resolved !== version) {
    throw new Error(`Expected ${packageName}@${version}, got ${resolved}`);
  }
}

function resolvePackageVersion(selector: string): string {
  return run("npm", ["view", `paykitjs@${selector}`, "version"]);
}

function copyRepo(tempRoot: string): void {
  fs.cpSync(REPO_ROOT, tempRoot, {
    recursive: true,
    filter: (source) => {
      const relative = path.relative(REPO_ROOT, source);
      if (!relative) return true;
      const parts = relative.split(path.sep);
      return !parts.some((part) =>
        [".git", "node_modules", ".next", ".turbo", "dist", "coverage"].includes(part),
      );
    },
  });
}

function patchDemoPackage(tempRoot: string, version: string): void {
  const packagePath = path.join(tempRoot, "apps/demo/package.json");
  const manifest = JSON.parse(fs.readFileSync(packagePath, "utf8")) as {
    dependencies?: Record<string, string>;
  };

  manifest.dependencies ??= {};
  delete manifest.dependencies["@paykitjs/dash"];
  for (const packageName of PAYKIT_PACKAGES) {
    manifest.dependencies[packageName] = version;
  }

  fs.writeFileSync(packagePath, `${JSON.stringify(manifest, null, 2)}\n`);
}

function patchVercelConfig(tempRoot: string): void {
  const vercelPath = path.join(tempRoot, "apps/demo/vercel.json");
  fs.writeFileSync(
    vercelPath,
    `${JSON.stringify(
      {
        buildCommand: "bun run build",
        framework: "nextjs",
        installCommand: "bun install",
      },
      null,
      2,
    )}\n`,
  );
}

function patchTsconfig(tempRoot: string): void {
  const tsconfigPath = path.join(tempRoot, "apps/demo/tsconfig.json");
  const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, "utf8")) as {
    compilerOptions?: Record<string, unknown>;
    extends?: string;
  };

  delete tsconfig.extends;
  tsconfig.compilerOptions = {
    strict: true,
    target: "esnext",
    module: "esnext",
    moduleResolution: "bundler",
    esModuleInterop: true,
    verbatimModuleSyntax: true,
    noUncheckedIndexedAccess: true,
    exactOptionalPropertyTypes: false,
    noErrorTruncation: true,
    ...tsconfig.compilerOptions,
  };

  fs.writeFileSync(tsconfigPath, `${JSON.stringify(tsconfig, null, 2)}\n`);
}

function deployDemo(): void {
  const target = getDeployTarget(process.argv[2]);
  const keepTemp = process.argv.includes("--keep-temp");
  const versionFlagIndex = process.argv.indexOf("--version");
  const versionArg = versionFlagIndex === -1 ? undefined : process.argv[versionFlagIndex + 1];

  assertTargetConfigured(target);

  if (versionFlagIndex !== -1 && !versionArg) {
    throw new Error(`Usage: bun deploy:${target} --version <paykit-version>`);
  }

  const npmSelector = versionArg ?? (target === "canary" ? "canary" : "latest");
  const config = DEPLOY_TARGETS[target];
  const envPath = path.join(DEMO_DIR, config.envFile);

  if (!fs.existsSync(envPath)) {
    throw new Error(`Missing ${config.envFile}`);
  }

  const demoEnv = dotenv.parse(fs.readFileSync(envPath));
  const version = resolvePackageVersion(npmSelector);

  if (npmSelector !== version) {
    console.log(`Resolved paykitjs@${npmSelector} -> ${version}`);
  }

  console.log(`Deploying ${config.projectName} with PayKit ${version}`);

  for (const packageName of PAYKIT_PACKAGES) {
    assertPackageVersionExists(packageName, version);
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `paykit-demo-${target}-`));

  try {
    copyRepo(tempRoot);
    patchDemoPackage(tempRoot, version);
    patchVercelConfig(tempRoot);
    patchTsconfig(tempRoot);

    const tempDemoDir = path.join(tempRoot, "apps/demo");
    fs.copyFileSync(envPath, path.join(tempDemoDir, ".env.local"));

    const vercelEnv = {
      ...demoEnv,
      VERCEL_ORG_ID,
      VERCEL_PROJECT_ID: config.projectId,
    };

    runInherit("bun", ["install"], { cwd: tempRoot, env: demoEnv });
    runInherit("bun", ["push"], { cwd: tempDemoDir, env: demoEnv });
    runInherit("bunx", ["vercel", "pull", "--yes", "--environment=production"], {
      cwd: tempDemoDir,
      env: vercelEnv,
    });
    runInherit("bunx", ["vercel", "deploy", "--prod"], { cwd: tempDemoDir, env: vercelEnv });
  } finally {
    if (keepTemp) {
      console.log(`Kept temp deploy repo: ${tempRoot}`);
    } else {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  deployDemo();
}
