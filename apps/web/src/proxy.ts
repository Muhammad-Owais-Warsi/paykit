import { type NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.endsWith(".md") && pathname.startsWith("/docs/")) {
    const stripped = pathname.slice(0, -3);
    const url = request.nextUrl.clone();
    url.pathname = `/llms.md${stripped}`;
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/docs/:path*.md",
};
