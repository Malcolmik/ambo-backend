import { Router } from "express";
import { authRequired } from "../../middleware/auth";
import { requireRole } from "../../middleware/requireRole";
import {
  createClient,
  getClient,
  listClients,
  updateClient,
} from "./clients.controller";

const router = Router();

// GET /api/clients - List all clients (authenticated users)
router.get("/", authRequired, listClients);

// POST /api/clients - Create client (SUPER_ADMIN only)
router.post(
  "/",
  authRequired,
  requireRole("SUPER_ADMIN"),
  createClient
);

// GET /api/clients/:id - Get specific client (authenticated users)
router.get("/:id", authRequired, getClient);

// PATCH /api/clients/:id - Update client (SUPER_ADMIN only)
router.patch(
  "/:id",
  authRequired,
  requireRole("SUPER_ADMIN"),
  updateClient
);

export default router;
