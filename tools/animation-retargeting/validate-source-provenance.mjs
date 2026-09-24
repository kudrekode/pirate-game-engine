import { assertSourceProvenance } from "./source-provenance.mjs";

const report = await assertSourceProvenance();
console.log(JSON.stringify(report, null, 2));
