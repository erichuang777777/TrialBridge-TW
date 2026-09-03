import { resolveNciTerminologyPath, syncNciTerminology } from "../lib/trials/terminology/nci.ts";

const destination = resolveNciTerminologyPath();
const snapshot = await syncNciTerminology(fetch, destination);
process.stdout.write(`${JSON.stringify({ status: "ready", source: snapshot.source, generatedAt: snapshot.generatedAt, conceptCount: snapshot.concepts.length, versions: [...new Set(snapshot.concepts.map((concept) => concept.version).filter(Boolean))], containsPatientData: false }, null, 2)}\n`);
