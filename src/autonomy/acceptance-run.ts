import { createAcceptanceSample } from "./scheduler";
import { processQueuedIdeas } from "./processor";

export async function runAcceptanceBatch(input: { count?: number; batchId?: string } = {}) {
  const count = Math.max(1, Math.min(20, input.count ?? 20));
  const sample = await createAcceptanceSample({
    batchId: input.batchId,
    limit: count,
  });
  const processed = await processQueuedIdeas(sample.created, { acceptanceBatchId: sample.batchId });
  return {
    ...sample,
    processed,
    readyForManualReview: processed.filter((row) =>
      ["READY_FOR_REVIEW","APPROVED"].includes(String(row.status))
    ).length,
  };
}
