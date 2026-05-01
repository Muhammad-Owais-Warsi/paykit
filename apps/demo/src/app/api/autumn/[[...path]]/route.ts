import { autumnHandler } from "autumn-js/next";

import { env } from "@/env";
import { auth } from "@/lib/auth";

function createHandler() {
  if (!env.AUTUMN_SECRET_KEY) return null;
  return autumnHandler({
    secretKey: env.AUTUMN_SECRET_KEY,
    identify: async (request) => {
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session) {
        return null;
      }
      return {
        customerId: session.user.id,
        customerData: {
          name: session.user.name ?? undefined,
          email: session.user.email,
        },
      };
    },
  });
}

const handler = createHandler();

function missingAutumn() {
  return Response.json({ error: "Autumn is not configured" }, { status: 404 });
}

export const GET = handler?.GET ?? missingAutumn;
export const POST = handler?.POST ?? missingAutumn;
export const DELETE = handler?.DELETE ?? missingAutumn;
