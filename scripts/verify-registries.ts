import { ClinicalTrialsGovAdapter } from "../lib/trials/adapters/clinicalTrialsGov.ts";
import { TfdaAdapter } from "../lib/trials/adapters/tfda.ts";

const input = { condition: "胃癌", pageSize: 2, includeNotOpen: true };
const [tfda, ctgov] = await Promise.all([
  new TfdaAdapter().search(input),
  new ClinicalTrialsGovAdapter().search({ ...input, condition: "gastric cancer" }),
]);

console.log(JSON.stringify({
  tfda: {
    count: tfda.trials.length,
    firstId: tfda.trials[0]?.canonicalId,
    firstUpdated: tfda.trials[0]?.sources[0].lastUpdated,
  },
  clinicalTrialsGov: {
    count: ctgov.trials.length,
    firstId: ctgov.trials[0]?.canonicalId,
    dataTimestamp: ctgov.sourceVersion,
  },
}, null, 2));
