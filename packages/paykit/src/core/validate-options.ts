import type { PayKitOptions } from "../types/options";

function hasLegacyPlansOption(options: object): options is { plans: unknown } {
  return Object.hasOwn(options, "plans");
}

export function getLegacyOptionsError(
  options: object,
  input?: { configPath?: string },
): string | null {
  if (!hasLegacyPlansOption(options)) {
    return null;
  }

  const target = input?.configPath ? ` in ${input.configPath}` : "";
  return `PayKit option \`plans\` has been renamed to \`products\`${target}. Update your \`createPayKit({ products: [...] })\` config and try again.`;
}

export function assertValidPayKitOptions(
  options: PayKitOptions | (PayKitOptions & { plans?: unknown }),
  input?: { configPath?: string },
): void {
  const error = getLegacyOptionsError(options, input);
  if (error) {
    throw new Error(error);
  }

  for (const origin of options.trustedOrigins ?? []) {
    assertValidTrustedOrigin(origin);
  }
}

function assertValidTrustedOrigin(origin: string): void {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new Error(
      `PayKit option \`trustedOrigins\` must contain absolute origins only. Received "${origin}".`,
    );
  }

  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error(
      `PayKit option \`trustedOrigins\` must not include a path, query, or hash. Received "${origin}".`,
    );
  }
}
