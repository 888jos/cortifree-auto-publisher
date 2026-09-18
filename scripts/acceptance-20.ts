import { runAcceptanceBatch } from "../src/autonomy/acceptance-run";

const accountId = process.env.ACCEPTANCE_ACCOUNT_ID || "CF_EN_01";
const result = await runAcceptanceBatch({ accountId, count: 20 });
console.log(JSON.stringify(result, null, 2));
if (result.readyForManualReview < 15) process.exitCode = 2;
