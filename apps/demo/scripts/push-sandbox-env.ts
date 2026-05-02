import {
  cleanupDir,
  createSandboxProjectDir,
  loadSandboxEnvFile,
  runCommand,
  sandboxConfig,
} from "./sandbox";

function printHelp() {
  console.log("Push .env.sandbox.local to Vercel production env for pk-sandbox");
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp();
    return;
  }

  const { filePath, values } = await loadSandboxEnvFile();
  const tempDir = await createSandboxProjectDir("paykit-sandbox-env-");

  try {
    console.log(`Pushing ${Object.keys(values).length} vars from ${filePath}`);

    for (const [name, value] of Object.entries(values)) {
      console.log(`Sync ${name} -> ${sandboxConfig.target}`);
      await runCommand(
        "vercel",
        [
          "env",
          "add",
          name,
          sandboxConfig.target,
          "--force",
          "--yes",
          "--scope",
          sandboxConfig.orgId,
          "--value",
          value,
        ],
        tempDir,
      );
    }

    console.log(`Sandbox env sync done for ${sandboxConfig.projectName}`);
  } finally {
    await cleanupDir(tempDir);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
