import { Router } from "express";
import { login, registerWorker, registerClientUser } from "./auth.controller";
import { authRequired } from "../../middleware/auth";
import { requireRole } from "../../middleware/requireRole";

const router = Router();

router.post("/login", login);

router.post(
  "/register-worker",
  authRequired,
  requireRole("SUPER_ADMIN"),
  registerWorker
);

router.post(
  "/register-client",
  authRequired,
  requireRole("SUPER_ADMIN"),
  registerClientUser
);

export default router;
