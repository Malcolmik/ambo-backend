import { Router } from "express";
import { authRequired } from "../../middleware/auth";
import { requireRole } from "../../middleware/requireRole";
import {
  login,
  registerClient,
  registerWorker,
  registerClientUser,
  getCurrentUser,
  changePassword,
} from "./auth.controller";

const router = Router();

// POST /api/auth/login - Login endpoint (public)
router.post("/login", login);

// POST /api/auth/register-client - Client self-registration (public)
router.post("/register-client", registerClient);

// POST /api/auth/register-worker - Create WORKER user (SUPER_ADMIN only)
router.post(
  "/register-worker",
  authRequired,
  requireRole("SUPER_ADMIN"),
  registerWorker
);

// POST /api/auth/register-client-user - Create CLIENT_VIEWER user (SUPER_ADMIN only)
router.post(
  "/register-client-user",
  authRequired,
  requireRole("SUPER_ADMIN"),
  registerClientUser
);

// GET /api/auth/me - Get current user details (authenticated users)
router.get("/me", authRequired, getCurrentUser);

// POST /api/auth/change-password - Change password (authenticated users)
router.post("/change-password", authRequired, changePassword);

export default router;
