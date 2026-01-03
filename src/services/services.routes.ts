import { Router } from "express";
import {
  getActiveServices,
  getAllServices,
  getService,
  createService,
  updateService,
  deleteService,
} from "./services.controller";
import { authRequired, optionalAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/requireRole";

const router = Router();

// ============================================
// PUBLIC ROUTES (No auth required)
// ============================================

// GET /api/services - Get active services for client view
router.get("/", optionalAuth, getActiveServices);

// ============================================
// PROTECTED ROUTES (SUPER_ADMIN only)
// ============================================

// GET /api/services/all - Get all services including inactive
router.get(
  "/all",
  authRequired,
  requireRole("SUPER_ADMIN"),
  getAllServices
);

// GET /api/services/:id - Get single service
router.get("/:id", authRequired, getService);

// POST /api/services - Create new service
router.post(
  "/",
  authRequired,
  requireRole("SUPER_ADMIN"),
  createService
);

// PATCH /api/services/:id - Update service
router.patch(
  "/:id",
  authRequired,
  requireRole("SUPER_ADMIN"),
  updateService
);

// DELETE /api/services/:id - Soft delete service
router.delete(
  "/:id",
  authRequired,
  requireRole("SUPER_ADMIN"),
  deleteService
);

export default router;
