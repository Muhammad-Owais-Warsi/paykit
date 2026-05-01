import { getPaykitStripe } from "@/lib/paykit/stripe";

function handle(request: Request) {
  const paykit = getPaykitStripe();
  if (!paykit) {
    return Response.json({ error: "PayKit Stripe is not configured" }, { status: 404 });
  }
  return paykit.handler(request);
}

export const GET = handle;
export const POST = handle;
