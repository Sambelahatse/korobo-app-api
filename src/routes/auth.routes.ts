import { Router } from "express";

export const authRouter = Router();

authRouter.get("/me", (_req, res) => {
  res.status(501).json({
    error: {
      code: "NOT_IMPLEMENTED",
      message: "Authentication middleware will be wired in the next step."
    }
  });
});
