import "reflect-metadata";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { app } from "./app";
import { env } from "./config/env";
import { AppDataSource, initializeDatabase } from "./database/data-source";
import { AppUser } from "./entities/AppUser";
import { verifyAccessToken } from "./services/auth";
import { companyRoom, configureRealtime } from "./services/realtime";

async function main(): Promise<void> {
  await initializeDatabase();
  const server = createServer(app);
  const allowedOrigins = env.CORS_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean);
  const io = new Server(server, {
    cors: { origin: allowedOrigins, methods: ["GET", "POST"] },
    transports: ["websocket", "polling"]
  });
  configureRealtime(io);

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.accessToken;
    if (typeof token !== "string" || !token) {
      next(new Error("AUTH_REQUIRED"));
      return;
    }
    try {
      const claims = verifyAccessToken(token);
      if (!claims.jti) {
        next(new Error("INVALID_SESSION"));
        return;
      }
      if (!AppDataSource.isInitialized) {
        next(new Error("DATABASE_UNAVAILABLE"));
        return;
      }
      const profile = await AppDataSource.getRepository(AppUser).findOne({ where: { id: claims.sub } });
      if (!profile || !profile.isActive || profile.email.toLowerCase() !== claims.email.toLowerCase()) {
        next(new Error("INVALID_SESSION"));
        return;
      }

      // Socket.IO connections must belong to a live, non-revoked database session.
      const sessions = await AppDataSource.query(
        "SELECT id FROM public.auth_sessions WHERE token_id = $1 AND user_id = $2 AND revoked_at IS NULL AND expires_at > now() LIMIT 1",
        [claims.jti, profile.id]
      ) as Array<{ id: string }>;
      if (!sessions.length) {
        next(new Error("SESSION_REVOKED"));
        return;
      }

      socket.data.authProfile = {
        id: profile.id,
        companyId: profile.companyId,
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

  io.on("connection", async (socket) => {
    const profile = socket.data.authProfile as AppUser | undefined;
    if (!profile?.companyId) {
      socket.disconnect(true);
      return;
    }

    // Room membership is derived exclusively from the authenticated database profile.
    // Clients cannot choose or join another company's room.
    await socket.join(companyRoom(profile.companyId));
    socket.emit("auth:verified", { data: profile });
    socket.emit("realtime:ready", { companyId: profile.companyId });
    socket.on("auth:ping", () => socket.emit("auth:pong", { timestamp: new Date().toISOString() }));
  });

  server.listen(env.PORT, "0.0.0.0", () => console.info(`KOROBO APP API listening on port ${env.PORT}`));

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
