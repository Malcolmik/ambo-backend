import { Router } from "express";
import { listClients, createClient } from "./clients.controller";
import { authRequired } from "../../middleware/auth";
import { requireRole } from "../../middleware/requireRole";

const router = Router();

router.get("/", authRequired, listClients);

router.post(
  "/",
  authRequired,
  requireRole("SUPER_ADMIN"),
  createClient
);

export default router;
