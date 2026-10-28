import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: "https://www.bsvex.com/" }, { url: "https://www.bsvex.com/llms.txt" }];
}
