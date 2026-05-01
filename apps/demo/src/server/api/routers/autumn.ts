import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { getAutumn } from "@/lib/autumn";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";

export const autumnRouter = createTRPCRouter({
  trackUsage: publicProcedure
    .input(z.object({ featureId: z.string(), value: z.number().int().min(1).optional() }))
    .mutation(async ({ ctx, input }) => {
      const session = await auth.api.getSession({ headers: ctx.headers });
      if (!session) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }
      const autumn = getAutumn();
      if (!autumn) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Autumn is not configured" });
      }
      const result = await autumn.track({
        customerId: session.user.id,
        featureId: input.featureId,
        value: input.value,
      });
      return result;
    }),
});
