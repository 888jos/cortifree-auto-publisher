import { runAcceptanceBatch } from "../src/autonomy/acceptance-run";

const result = await runAcceptanceBatch({ count: 20 });
console.log(JSON.stringify(result, null, 2));
if (result.readyForManualReview < 15) process.exitCode = 2;
