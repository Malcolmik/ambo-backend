import { Router } from "express";
import {
  getActivePackages,
  getAllPackages,
  getPackage,
  createPackage,
  updatePackage,
  deletePackage,
} from "./packages.controller";
import { authRequired, optionalAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/requireRole";

const router = Router();

// ============================================
// PUBLIC ROUTES (No auth required)
// ============================================

// GET /api/packages - Get active packages for client view
router.get("/", optionalAuth, getActivePackages);

// ============================================
// PROTECTED ROUTES (SUPER_ADMIN only)
// ============================================

// GET /api/packages/all - Get all packages including inactive
router.get(
  "/all",
  authRequired,
  requireRole("SUPER_ADMIN"),
  getAllPackages
);

// GET /api/packages/:id - Get single package
router.get("/:id", authRequired, getPackage);

// POST /api/packages - Create new package
router.post(
  "/",
  authRequired,
  requireRole("SUPER_ADMIN"),
  createPackage
);

// PATCH /api/packages/:id - Update package
router.patch(
  "/:id",
  authRequired,
  requireRole("SUPER_ADMIN"),
  updatePackage
);

// DELETE /api/packages/:id - Soft delete package
router.delete(
  "/:id",
  authRequired,
  requireRole("SUPER_ADMIN"),
  deletePackage
);

export default router;
