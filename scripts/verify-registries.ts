import { ClinicalTrialsGovAdapter } from "../lib/trials/adapters/clinicalTrialsGov.ts";
import { TfdaAdapter } from "../lib/trials/adapters/tfda.ts";
import { createRegistryQueryPlan } from "../lib/trials/queryBridge.ts";

const input = { condition: "胃癌", pageSize: 2, includeNotOpen: true };
const queryPlan = createRegistryQueryPlan(input.condition);
const [tfda, ctgov] = await Promise.all([
  new TfdaAdapter().search({ ...input, condition: queryPlan.registryConditions.TFDA }),
  new ClinicalTrialsGovAdapter().search({ ...input, condition: queryPlan.registryConditions["ClinicalTrials.gov"] }),
]);

console.log(JSON.stringify({
  queryPlan,
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
