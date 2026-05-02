import { demoDir, loadSandboxEnvFile, runCommand } from "./sandbox";

function printHelp() {
  console.log("Push demo sandbox auth and provider config using .env.sandbox.local");
}

function hasEnv(env: Record<string, string>, keys: string[]) {
  return keys.every((key) => {
    const value = env[key];
    return typeof value === "string" && value.length > 0;
  });
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp();
    return;
  }

  const { filePath, values } = await loadSandboxEnvFile();
  const env = { ...values, PAYKIT_CLI: "1" };

  console.log(`Push sandbox config from ${filePath}`);

  console.log("Push auth migrations");
  await runCommand(
    "bunx",
    ["auth", "migrate", "--config", "src/lib/auth.ts", "--yes"],
    demoDir,
    env,
  );

  if (hasEnv(values, ["POLAR_DATABASE_URL", "POLAR_ACCESS_TOKEN", "POLAR_WEBHOOK_SECRET"])) {
    console.log("Push PayKit Polar config");
    await runCommand(
      "bunx",
      ["paykitjs", "push", "--config", "paykit.polar.config.ts", "--yes"],
      demoDir,
      env,
    );
  } else {
    console.log("Skipping PayKit Polar push: provider env incomplete");
  }

  if (hasEnv(values, ["STRIPE_DATABASE_URL", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"])) {
    console.log("Push PayKit Stripe config");
    await runCommand(
      "bunx",
      ["paykitjs", "push", "--config", "paykit.stripe.config.ts", "--yes"],
      demoDir,
      env,
    );
  } else {
    console.log("Skipping PayKit Stripe push: provider env incomplete");
  }

  if (hasEnv(values, ["AUTUMN_SECRET_KEY"])) {
    console.log("Push Autumn config");
    await runCommand("atmn", ["push"], demoDir, env);
  } else {
    console.log("Skipping Autumn push: provider env incomplete");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
