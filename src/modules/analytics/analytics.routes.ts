import { Router } from "express";
import {
  getOverview,
  getRevenueAnalytics,
  getWorkerPerformance,
} from "./analytics.controller";
import { authRequired } from "../../middleware/auth";
import { requireRole } from "../../middleware/requireRole";

const router = Router();

// All analytics endpoints require SUPER_ADMIN role
router.get("/overview", authRequired, requireRole("SUPER_ADMIN"), getOverview);
router.get("/revenue", authRequired, requireRole("SUPER_ADMIN"), getRevenueAnalytics);
router.get("/worker-performance", authRequired, requireRole("SUPER_ADMIN"), getWorkerPerformance);

export default router;
