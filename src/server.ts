import "reflect-metadata";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { app } from "./app";
import { env } from "./config/env";
import { AppDataSource, initializeDatabase } from "./database/data-source";
import { AppUser } from "./entities/AppUser";
import { verifyAccessToken } from "./services/authTokens";

async function main(): Promise<void> {
  await initializeDatabase();

  const server = createServer(app);
  const allowedOrigins = env.CORS_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean);
  const io = new Server(server, {
    cors: { origin: allowedOrigins, methods: ["GET", "POST"], credentials: true },
    transports: ["websocket", "polling"]
  });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.accessToken;
    if (typeof token !== "string" || !token) {
      next(new Error("AUTH_REQUIRED"));
      return;
    }

    try {
      const claims = verifyAccessToken(token);
      if (!AppDataSource.isInitialized) {
        next(new Error("AUTH_UNAVAILABLE"));
        return;
      }
      const profile = await AppDataSource.getRepository(AppUser).findOne({ where: { id: claims.sub } });
      if (!profile || !profile.isActive) {
        next(new Error("ACCOUNT_NOT_ALLOWED"));
        return;
      }
      socket.data.authProfile = {
        id: profile.id,
        fullName: profile.fullName,
        email: profile.email,
        role: profile.role,
        phone: profile.phone,
        isActive: profile.isActive
      };
      next();
    } catch {
      next(new Error("INVALID_SESSION"));
    }
  });

  io.on("connection", (socket) => {
    socket.emit("auth:verified", { data: socket.data.authProfile });
    socket.on("auth:ping", () => socket.emit("auth:pong", { timestamp: new Date().toISOString() }));
  });

  server.listen(env.PORT, "0.0.0.0", () => {
    console.info(`KOROBO APP API listening on port ${env.PORT}`);
  });

  function shutdown(signal: string): void {
    console.info(`${signal} received; shutting down gracefully`);
    io.close(async () => {
      if (AppDataSource.isInitialized) await AppDataSource.destroy();
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
