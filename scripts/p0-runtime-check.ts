import { getConvexCounts, getConvexPing, convexConfigured } from "../app/lib/data-backend";
import { googleServiceAccountConfigured } from "../app/lib/google/auth";
import { readSheetRange } from "../app/lib/google/sheets";
import { listDriveChildren } from "../app/lib/google/drive";

function flag(value: unknown) {
  return Boolean(typeof value === "string" ? value.trim() : value);
}

async function main() {
  const report: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    env: {
      NEXT_PUBLIC_CONVEX_URL: flag(process.env.NEXT_PUBLIC_CONVEX_URL),
      CORTIFREE_BACKEND_SECRET: flag(process.env.CORTIFREE_BACKEND_SECRET),
      GOOGLE_SERVICE_ACCOUNT_EMAIL: flag(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL),
      GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: flag(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY),
      UPLOAD_POST_API_KEY: flag(process.env.UPLOAD_POST_API_KEY),
      CRON_SECRET: flag(process.env.CRON_SECRET),
      OPENAI_API_KEY: flag(process.env.OPENAI_API_KEY),
      MODELARK_API_KEY: flag(process.env.MODELARK_API_KEY),
      MODELARK_MODEL_ID: flag(process.env.MODELARK_MODEL_ID),
    },
    convex: {
      configured: convexConfigured(),
      live: false,
      counts: null,
      ping: null,
      error: null,
      dataError: null,
    },
    google: {
      configured: googleServiceAccountConfigured(),
      sheetReadable: false,
      driveReadable: false,
      error: null,
    },
  };

  if (convexConfigured()) {
    try {
      (report.convex as any).ping = await getConvexPing();
      (report.convex as any).live = true;
    } catch (error) {
      (report.convex as any).error = error instanceof Error ? error.message : String(error);
    }
    if ((report.convex as any).live) {
      try {
        const counts = await getConvexCounts();
        (report.convex as any).counts = {
          personas: counts.personas ?? 0,
          accounts: counts.accounts ?? 0,
          assets: counts.assets ?? 0,
          content_topics: counts.content_topics ?? 0,
          content_hooks: counts.content_hooks ?? 0,
          content_ctas: counts.content_ctas ?? 0,
          visual_references: counts.visual_references ?? 0,
          carousels: counts.carousels ?? 0,
          publish_jobs: counts.publish_jobs ?? 0,
        };
      } catch (error) {
        (report.convex as any).dataError = error instanceof Error ? error.message : String(error);
      }
    }
  }

  if (googleServiceAccountConfigured()) {
    try {
      const values = await readSheetRange("00_CONFIG", "A1:F5");
      (report.google as any).sheetReadable = values.length > 0;
      const files = await listDriveChildren(process.env.GOOGLE_DRIVE_ROOT_ID || "1I7OJ8juCsXINUMNJZ5IO5qhIrjYJlqi_");
      (report.google as any).driveReadable = files.length > 0;
    } catch (error) {
      (report.google as any).error = error instanceof Error ? error.message : String(error);
    }
  }

  const counts = (report.convex as any).counts as Record<string, number> | null;
  const readiness = {
    convexConfigured: (report.convex as any).configured === true,
    convexLive: (report.convex as any).live === true,
    editorialLoaded: Boolean(counts && counts.personas >= 16 && counts.content_topics >= 500 && counts.content_hooks >= 200 && counts.content_ctas >= 30),
    googleConfigured: (report.google as any).configured === true,
    googleReadable: (report.google as any).sheetReadable === true && (report.google as any).driveReadable === true,
    uploadPostConfigured: flag(process.env.UPLOAD_POST_API_KEY),
    cronConfigured: flag(process.env.CRON_SECRET),
  };
  const ready = readiness.convexConfigured && readiness.convexLive && readiness.editorialLoaded && readiness.googleConfigured && readiness.googleReadable;
  report.readiness = { ...readiness, p0InfrastructureReady: ready };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ fatal: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exitCode = 1;
});
