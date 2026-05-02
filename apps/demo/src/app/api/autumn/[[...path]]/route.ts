import { createAutumnHandler } from "@/lib/autumn";

function createHandler() {
  return createAutumnHandler();
}

const handler = createHandler();

function missingAutumn() {
  return Response.json({ error: "Autumn is not configured" }, { status: 404 });
}

export const GET = handler?.GET ?? missingAutumn;
export const POST = handler?.POST ?? missingAutumn;
export const DELETE = handler?.DELETE ?? missingAutumn;
