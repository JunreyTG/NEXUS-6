import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { disconnectSystemDatabase } from "./infrastructure/database/client.js";

const server = createApp().listen(env.API_PORT, () => {
  console.log(`NEXUS-6 API listening on port ${env.API_PORT}`);
});

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => process.exit(1), 10000);
  deadline.unref();
  server.close(() => {
    void disconnectSystemDatabase().then(() => {
      clearTimeout(deadline);
    }).catch(() => {
      process.exitCode = 1;
    });
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
