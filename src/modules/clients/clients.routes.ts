import { Router } from "express";
import { authRequired } from "../../middleware/auth";
import { requireRole } from "../../middleware/requireRole";
import {
  createClient,
  getClient,
  listClients,
  updateClient,
  assignClientToWorker,
  getClients,
} from "./clients.controller";

const router = Router();

// 1. General List (Must be first)
// GET /api/clients
router.get("/", authRequired, listClients);

// 2. Specific Static Routes (MUST be before /:id)
// GET /api/clients/all-for-assign
router.get(
  "/all-for-assign", 
  authRequired, 
  requireRole("SUPER_ADMIN", "ADMIN"), 
  getClients
);

// POST /api/clients/assign
router.post(
  "/assign",
  authRequired,
  requireRole("SUPER_ADMIN", "ADMIN"),
  assignClientToWorker
);

// POST /api/clients (Create)
router.post(
  "/",
  authRequired,
  requireRole("SUPER_ADMIN", "ADMIN"),
  createClient
);

// 3. Dynamic Routes (MUST be last)
// GET /api/clients/:id 
// (If this was above 'all-for-assign', it would catch 'all-for-assign' as an ID)
router.get("/:id", authRequired, getClient);

// PATCH /api/clients/:id - UPDATED: Added ADMIN role
router.patch(
  "/:id",
  authRequired,
  requireRole("SUPER_ADMIN", "ADMIN"),
  updateClient
);

export default router;
