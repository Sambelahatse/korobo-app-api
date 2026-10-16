import "reflect-metadata";
import { app } from "./app";
import { env } from "./config/env";
import { initializeDatabase } from "./database/data-source";

async function main(): Promise<void> {
  await initializeDatabase();

  const server = app.listen(env.PORT, "0.0.0.0", () => {
    console.info(`KOROBO APP API listening on port ${env.PORT}`);
  });

  function shutdown(signal: string): void {
    console.info(`${signal} received; shutting down gracefully`);
    server.close(async (error) => {
      if (error) {
        console.error("Error while closing HTTP server:", error);
        process.exitCode = 1;
      }

      const { AppDataSource } = await import("./database/data-source");
      if (AppDataSource.isInitialized) {
        await AppDataSource.destroy();
      }
      process.exit();
    });
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((error: unknown) => {
  console.error("Failed to start KOROBO APP API:", error);
  process.exit(1);
});
