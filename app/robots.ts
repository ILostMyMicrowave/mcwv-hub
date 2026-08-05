import type { MetadataRoute } from "next";

// Private clan hub — keep everything out of search indexes.
// (Link unfurlers like Discord don't consult robots.txt, so the OG share
// card still renders when links are pasted into chat.)
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
