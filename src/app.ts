import express from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env";
import { AppDataSource } from "./database/data-source";
import { authRouter } from "./routes/auth.routes";
import { registrationRouter } from "./routes/registration.routes";
import { googleAuthRouter } from "./routes/google-auth.routes";
import { accountRouter } from "./routes/account.routes";
import { equipmentRouter } from "./routes/equipment.routes";
import { sitesRouter } from "./routes/sites.routes";

export const app = express();

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN.split(",").map((origin) => origin.trim()) }));
app.use(express.json({ limit: "1mb" }));

app.use("/auth", authRouter);
app.use("/register", registrationRouter);
app.use("/auth/google", googleAuthRouter);
app.use("/account", accountRouter);
app.use("/equipment", equipmentRouter);
app.use("/sites", sitesRouter);

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "korobo-app-api",
    timestamp: new Date().toISOString()
  });
});

app.get("/health/ready", async (_req, res) => {
  if (!AppDataSource.isInitialized) {
    res.status(503).json({
      status: "not_ready",
      database: "not_configured"
    });
    return;
  }

  try {
    await AppDataSource.query("SELECT 1");
    res.status(200).json({ status: "ready", database: "connected" });
  } catch {
    res.status(503).json({ status: "not_ready", database: "unavailable" });
  }
});

app.use((_req, res) => {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "Route not found"
    }
  });
});
