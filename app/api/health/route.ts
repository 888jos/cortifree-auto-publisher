import { convexConfigured } from "../../lib/data-backend";

const DEFAULT_CORTIFREE_URL = "https://cortifree-auto-publisher.vercel.app";
const DEFAULT_COCORISE_URL = "https://cocorise-auto-publisher.vercel.app";

export async function GET() {
  const configured = convexConfigured();
  const canonicalUrl = process.env.CORTIFREE_CANONICAL_URL ?? DEFAULT_CORTIFREE_URL;
  const cocoriseUrl = process.env.NEXT_PUBLIC_COCORISE_URL ?? DEFAULT_COCORISE_URL;
  const crossProductUrlsSeparated = canonicalUrl !== cocoriseUrl;

  return Response.json(
    {
      ok: configured && crossProductUrlsSeparated,
      service: "cortifree-auto-publisher",
      product: "cortifree",
      workspace: "cortifree",
      backend: "convex",
      backendConfigured: configured,
      canonicalUrl,
      linkedCocoriseUrl: cocoriseUrl,
      crossProductUrlsSeparated,
      dryRun: process.env.DRY_RUN !== "false",
    },
    { status: configured && crossProductUrlsSeparated ? 200 : 503 },
  );
}
