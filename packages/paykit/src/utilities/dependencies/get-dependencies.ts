import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

export interface ResolvedDependency {
  path: string;
  version: string;
}

export interface DependencyResolution {
  missing: string[];
  resolved: Map<string, ResolvedDependency>;
}

function resolveFrom(fromDirectory: string, moduleId: string): string | undefined {
  try {
    fromDirectory = fs.realpathSync(fromDirectory);
  } catch {
    fromDirectory = path.resolve(fromDirectory);
  }

  const fromFile = path.join(fromDirectory, "noop.js");

  const require = createRequire(import.meta.url);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Module = require("node:module");

  try {
    return Module._resolveFilename(moduleId, {
      id: fromFile,
      filename: fromFile,
      paths: Module._nodeModulePaths(fromDirectory),
    });
  } catch {
    return undefined;
  }
}

function findPackageJson(startDir: string): string | null {
  const { root } = path.parse(startDir);
  let dir = startDir;

  while (dir !== root) {
    const candidate = path.join(dir, "package.json");
    try {
      fs.accessSync(candidate);
      return candidate;
    } catch {
      dir = path.dirname(dir);
    }
  }

  return null;
}

export async function getDependencies(
  baseDir: string,
  packages: string[],
): Promise<DependencyResolution> {
  const resolved = new Map<string, ResolvedDependency>();
  const missing: string[] = [];

  await Promise.all(
    packages.map(async (pkg) => {
      try {
        const pkgEntryPath = resolveFrom(baseDir, pkg);
        if (!pkgEntryPath) {
          missing.push(pkg);
          return;
        }

        const realPath = fs.realpathSync(pkgEntryPath);
        const pkgDir = path.dirname(realPath);
        const packageJsonPath = findPackageJson(pkgDir);

        if (!packageJsonPath) {
          missing.push(pkg);
          return;
        }

        const packageJson = JSON.parse(await fs.promises.readFile(packageJsonPath, "utf-8")) as {
          version: string;
        };

        resolved.set(pkg, {
          path: packageJsonPath,
          version: packageJson.version,
        });
      } catch {
        missing.push(pkg);
      }
    }),
  );

  return { missing, resolved };
}
