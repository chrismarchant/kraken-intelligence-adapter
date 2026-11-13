// Helper process for the cross-process store test. Not a test file.
// usage: node store-writer.ts <dir> <campaignId> <writerName> <count>
import { FileCampaignStore } from "../../../src/store/store.ts";

const [dir, id, writer, count] = process.argv.slice(2) as [string, string, string, string];
const store = new FileCampaignStore(dir);
for (let i = 0; i < Number(count); i++) {
  await store.update(id, (record) => {
    record.audit.push({ at: "2026-01-05T09:00:00.000Z", event: "process-race", detail: `${writer}:${i}` });
  });
}
