import { Router } from "express";
import { authRequired } from "../../middleware/auth";
import { requireRole } from "../../middleware/requireRole";
import {
  getAllUsers,
  getUser,
  approveUser,
  rejectUser,
  toggleUserActive,
} from "./users.controller";

const router = Router();

// GET /api/users - Get all users (SUPER_ADMIN only)
router.get("/", authRequired, requireRole("SUPER_ADMIN"), getAllUsers);

// GET /api/users/:id - Get specific user (SUPER_ADMIN only)
router.get("/:id", authRequired, requireRole("SUPER_ADMIN"), getUser);

// POST /api/users/:id/approve - Approve CLIENT_VIEWER_PENDING user (SUPER_ADMIN only)
router.post("/:id/approve", authRequired, requireRole("SUPER_ADMIN"), approveUser);

// POST /api/users/:id/reject - Reject CLIENT_VIEWER_PENDING user (SUPER_ADMIN only)
router.post("/:id/reject", authRequired, requireRole("SUPER_ADMIN"), rejectUser);

// PATCH /api/users/:id/toggle-active - Toggle user active status (SUPER_ADMIN only)
router.patch("/:id/toggle-active", authRequired, requireRole("SUPER_ADMIN"), toggleUserActive);

export default router;