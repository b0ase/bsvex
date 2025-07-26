import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";

export async function GET(request: NextRequest) {
  try {
    const faviconPath = path.join(process.cwd(), "public", "bsvex", "logo.jpg");
    const imageBuffer = fs.readFileSync(faviconPath);
    
    return new Response(imageBuffer, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    return new Response("Favicon not found", { status: 404 });
  }
} 