import { Router } from "express";
import { authRequired } from "../../middleware/auth";
import { requireRole } from "../../middleware/requireRole";
import {
  listClients,
  createClient,
  getClient,    // New import
  updateClient, // New import
} from "./clients.controller";

const router = Router();

// GET /api/clients - List all clients (SUPER_ADMIN, WORKER, CLIENT_VIEWER logic inside controller)
router.get("/", authRequired, listClients);

// POST /api/clients - Create Client (SUPER_ADMIN only)
router.post(
  "/",
  authRequired,
  requireRole("SUPER_ADMIN"),
  createClient
);

// GET /api/clients/:id - Get specific client details
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