#!/usr/bin/env node

import { Command } from "commander";

import { version } from "../version";

process.env.PAYKIT_CLI = "1";

const program = new Command()
  .name("paykitjs")
  .description("CLI for PayKit")
  .version(version, "-v, --version");

const commandName = process.argv[2];

switch (commandName) {
  case "status": {
    const { statusCommand } = await import("./commands/status");
    program.addCommand(statusCommand);
    break;
  }
  case "init": {
    const { initCommand } = await import("./commands/init");
    program.addCommand(initCommand);
    break;
  }
  case "push": {
    const { pushCommand } = await import("./commands/push");
    program.addCommand(pushCommand);
    break;
  }
  case "listen": {
    const { listenCommand } = await import("./commands/listen");
    program.addCommand(listenCommand);
    break;
  }
  default: {
    const [{ statusCommand }, { initCommand }, { pushCommand }, { listenCommand }] =
      await Promise.all([
        import("./commands/status"),
        import("./commands/init"),
        import("./commands/push"),
        import("./commands/listen"),
      ]);
    program.addCommand(statusCommand);
    program.addCommand(initCommand);
    program.addCommand(pushCommand);
    program.addCommand(listenCommand);
  }
}

try {
  await program.parseAsync(process.argv);
} catch (error) {
  const { captureError, flush } = await import("./utils/telemetry");
  const command = commandName ?? "unknown";
  captureError(command, error);

  const message = error instanceof Error ? error.message : String(error);
  console.error(`\n  error: ${message}\n`);
  await flush();
  process.exit(1);
}
