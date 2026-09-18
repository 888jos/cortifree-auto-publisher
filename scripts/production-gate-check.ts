import { productionGateStatus } from "../src/autonomy/production-gate";

const gate = await productionGateStatus();
console.log(JSON.stringify(gate, null, 2));
if (!gate.ready) {
  console.error("\nProduction gate is not ready:");
  for (const blocker of gate.blockers) console.error(`- ${blocker}`);
  process.exitCode = 2;
}
