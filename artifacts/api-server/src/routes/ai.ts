import { Router, type IRouter } from "express";
import { getAIStatus, interpretSearchQuery } from "../ai/index.js";

const router: IRouter = Router();

router.get("/ai/status", (_req, res): void => {
  res.json(getAIStatus());
});

router.get("/ai/search", (req, res): void => {
  const q = typeof req.query.q === "string" ? req.query.q : "";
  if (!q.trim()) {
    res.status(400).json({ error: "Query parameter 'q' is required" });
    return;
  }
  res.json(interpretSearchQuery(q));
});

export default router;
