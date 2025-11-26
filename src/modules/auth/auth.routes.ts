import { Router } from "express";
import { authRequired } from "../../middleware/auth";
import { login, registerWorker, registerClientUser } from "./auth.controller";
import { requireRole } from "../../middleware/requireRole";
import {
  createClient,
  getClient,
  listClients,
  updateClient,
} from "../../modules/clients/clients.controller";

const router = Router();

// GET /api/clients - List all clients
router.get("/", authRequired, listClients);

router.post("/login", login);

router.post(
  "/register-worker",
  requireRole("SUPER_ADMIN"),
  registerWorker
);


router.post(
  "/register-client-viewer",
  requireRole("SUPER_ADMIN"),
  registerClientUser
);

// POST /api/clients - Create Client (SUPER_ADMIN only)
router.post(
  "/",
  authRequired,
  requireRole("SUPER_ADMIN"),
  createClient
);

// GET /api/clients/:id - Get specific client
router.get(
  "/:id",
  authRequired,
  getClient
);

// PATCH /api/clients/:id - Update specific client (SUPER_ADMIN only)
router.patch(
  "/:id",
  authRequired,
  requireRole("SUPER_ADMIN"),
  updateClient
);

export default router;