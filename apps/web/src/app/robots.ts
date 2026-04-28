import type { MetadataRoute } from "next";

import { URLs } from "@/lib/consts";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
      },
      {
        userAgent: "*",
        disallow: ["/api/", "/_next/static/media/"],
      },
    ],
    sitemap: `${URLs.site}/sitemap.xml`,
    host: URLs.site,
  };
}
