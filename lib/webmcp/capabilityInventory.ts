import { webMcpToolContractCatalog } from "./toolContractCatalog.ts";

export const webMcpCapabilityInventory = webMcpToolContractCatalog.map(({ name, kind, availability, boundary }) => ({ name, kind, availability, boundary }));
