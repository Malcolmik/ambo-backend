import { Router } from "express";
import { authRequired } from "../../middleware/auth";
import { requireRole } from "../../middleware/requireRole";
import {
  // Platform settings
  getSupportChannels,
  getPlatformSettings,
  updatePlatformSettings,
  // Admin management
  createAdmin,
  getAdmins,
  updateAdmin,
  deactivateAdmin,
  // Worker management
  getWorkers,
  createWorker,
  getWorker,
  updateWorker,
  deactivateWorker,
  // Chat oversight
  adminJoinChat,
  getAllChats,
} from "./settings.controller";

const router = Router();

// ============================================
// SUPPORT CHANNELS (All authenticated users)
// ============================================

// GET /api/settings/support - Get support channel info
router.get(
  "/support",
  authRequired,
  getSupportChannels
);

// ============================================
// PLATFORM SETTINGS (SUPER_ADMIN only)
// ============================================

// GET /api/settings - Get all platform settings
router.get(
  "/",
  authRequired,
  requireRole("SUPER_ADMIN"),
  getPlatformSettings
);

// PATCH /api/settings - Update platform settings
router.patch(
  "/",
  authRequired,
  requireRole("SUPER_ADMIN"),
  updatePlatformSettings
);

// ============================================
// ADMIN MANAGEMENT (SUPER_ADMIN only)
// ============================================

// POST /api/settings/admins - Create admin user
router.post(
  "/admins",
  authRequired,
  requireRole("SUPER_ADMIN"),
  createAdmin
);

// Alias: POST /api/settings/create-admin
router.post(
  "/create-admin",
  authRequired,
  requireRole("SUPER_ADMIN"),
  createAdmin
);

// GET /api/settings/admins - Get all admin users
router.get(
  "/admins",
  authRequired,
  requireRole("SUPER_ADMIN"),
  getAdmins
);

// PATCH /api/settings/admins/:id - Update admin user
router.patch(
  "/admins/:id",
  authRequired,
  requireRole("SUPER_ADMIN"),
  updateAdmin
);

// DELETE /api/settings/admins/:id - Deactivate admin user
router.delete(
  "/admins/:id",
  authRequired,
  requireRole("SUPER_ADMIN"),
  deactivateAdmin
);

// ============================================
// WORKER MANAGEMENT (ADMIN + SUPER_ADMIN)
// ============================================

// GET /api/settings/workers - Get all workers
router.get(
  "/workers",
  authRequired,
  requireRole("ADMIN", "SUPER_ADMIN"),
  getWorkers
);

// POST /api/settings/workers - Create worker
router.post(
  "/workers",
  authRequired,
  requireRole("ADMIN", "SUPER_ADMIN"),
  createWorker
);

// GET /api/settings/workers/:id - Get specific worker
router.get(
  "/workers/:id",
  authRequired,
  requireRole("ADMIN", "SUPER_ADMIN"),
  getWorker
);

// PATCH /api/settings/workers/:id - Update worker
router.patch(
  "/workers/:id",
  authRequired,
  requireRole("ADMIN", "SUPER_ADMIN"),
  updateWorker
);

// DELETE /api/settings/workers/:id - Deactivate worker
router.delete(
  "/workers/:id",
  authRequired,
  requireRole("ADMIN", "SUPER_ADMIN"),
  deactivateWorker
);

// ============================================
// CHAT OVERSIGHT (ADMIN + SUPER_ADMIN)
// ============================================

// GET /api/settings/chats - Get all chat channels
router.get(
  "/chats",
  authRequired,
  requireRole("ADMIN", "SUPER_ADMIN"),
  getAllChats
);

// POST /api/settings/chats/:channelId/join - Admin joins chat
router.post(
  "/chats/:channelId/join",
  authRequired,
  requireRole("ADMIN", "SUPER_ADMIN"),
  adminJoinChat
);

export default router;
