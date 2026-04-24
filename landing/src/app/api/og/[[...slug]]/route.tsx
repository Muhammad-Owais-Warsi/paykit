import { notFound } from "next/navigation";
import { ImageResponse } from "next/og";

import { source } from "@/lib/source";

export function generateStaticParams() {
  return source.generateParams();
}

export const GET = async (req: Request, { params }: { params: Promise<{ slug?: string[] }> }) => {
  try {
    let title: string;
    const { slug } = await params;

    if (!slug || slug.length === 0) {
      title = "Documentation";
    } else {
      const page = source.getPage(slug ?? []);
      if (!page) notFound();
      title = page.data.title ?? "Documentation";
    }

    return new ImageResponse(
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          backgroundColor: "#121212",
          color: "white",
        }}
      >
        <img
          src="https://github.com/t3duk/paykit/blob/t3duk/feat/sitemap-auto-gen/landing/public/og-blank.png?raw=true"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: 57,
            left: 65,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <p
            style={{
              fontSize: 72,
              fontWeight: 600,
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
              maxWidth: "400px",
            }}
          >
            {title}
          </p>
        </div>
      </div>,
      {
        width: 1200,
        height: 600,
      },
    );
  } catch {
    return new Response(`Failed to generate the image`, {
      status: 500,
    });
  }
};
