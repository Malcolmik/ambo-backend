import { Router } from "express";
import { authRequired } from "../../middleware/auth";
import { requireRole } from "../../middleware/requireRole";
import {
  createClient,
  getClient,
  listClients,
  updateClient, // <--- This will stop red-lining ONLY if the controller is saved with the export
} from "../../modules/clients/clients.controller";

const router = Router();

// GET /api/clients - List all clients
router.get("/", authRequired, listClients);

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