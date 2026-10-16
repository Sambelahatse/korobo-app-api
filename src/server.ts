import "reflect-metadata";
import { app } from "./app";
import { env } from "./config/env";

const server = app.listen(env.PORT, "0.0.0.0", () => {
  console.info(`KOROBO APP API listening on port ${env.PORT}`);
});

function shutdown(signal: string): void {
  console.info(`${signal} received; shutting down gracefully`);
  server.close((error) => {
    if (error) {
      console.error("Error while closing HTTP server:", error);
      process.exit(1);
    }
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
