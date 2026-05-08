import picocolors from "picocolors";
import yoctoSpinner from "yocto-spinner";

function writeLine(message = ""): void {
  process.stdout.write(`${message}\n`);
}

function formatTimestamp(date = new Date()): string {
  return date.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function timestampLabel(): string {
  return picocolors.dim(formatTimestamp());
}

export function createDevLogger() {
  const spinner = yoctoSpinner({ text: "" });

  function flushSpinner() {
    spinner.stop();
  }

  return {
    start(message: string) {
      spinner.start(message);
    },

    update(message: string) {
      spinner.text = message;
    },

    stop() {
      flushSpinner();
    },

    info(message: string) {
      flushSpinner();
      writeLine(`${timestampLabel()} ${message}`);
    },

    warn(message: string) {
      flushSpinner();
      writeLine(`${timestampLabel()} ${picocolors.yellow(message)}`);
    },

    event(params: {
      eventId: string;
      eventType: string;
      replay: boolean;
      status: number | string;
    }) {
      flushSpinner();
      const statusLabel =
        typeof params.status === "number" || /^\d+$/.test(String(params.status))
          ? picocolors.green(String(params.status))
          : picocolors.yellow(String(params.status));
      const replaySuffix = params.replay ? picocolors.dim(" (replay)") : "";
      writeLine(
        `${timestampLabel()} ${statusLabel} ${params.eventType} ${picocolors.dim(params.eventId)}${replaySuffix}`,
      );
    },

    print(message: string) {
      flushSpinner();
      writeLine(message);
    },
  };
}
