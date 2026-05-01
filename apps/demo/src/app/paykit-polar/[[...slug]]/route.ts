import { getPaykitPolar } from "@/lib/paykit/polar";

function handle(request: Request) {
  const paykit = getPaykitPolar();
  if (!paykit) {
    return Response.json({ error: "PayKit Polar is not configured" }, { status: 404 });
  }
  return paykit.handler(request);
}

export const GET = handle;
export const POST = handle;
