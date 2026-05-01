/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {
  transpilePackages: ["paykitjs", "@paykitjs/polar", "@paykitjs/stripe", "autumn-js"],
  serverExternalPackages: ["pg"],
  turbopack: {
    root: new URL("../..", import.meta.url).pathname,
  },
};

export default config;
