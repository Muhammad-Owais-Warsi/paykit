import { betterAuth } from "better-auth";

import { env } from "@/env";
import { authPool } from "@/server/db";

export const auth = betterAuth({
  baseURL: env.APP_URL,
  database: authPool,
  emailAndPassword: {
    enabled: true,
  },
});
