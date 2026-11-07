import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Every page is dynamic and per-user, so no incremental cache (R2/KV) is configured.
export default defineCloudflareConfig({});
