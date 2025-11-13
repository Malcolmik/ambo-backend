import { Router } from "express";
import { listUsers, updateUser } from "./users.controller";
import { authRequired } from "../../middleware/auth";
import { requireRole } from "../../middleware/requireRole";

const router = Router();

router.get("/", authRequired, requireRole("SUPER_ADMIN"), listUsers);
router.patch("/:id", authRequired, requireRole("SUPER_ADMIN"), updateUser);

export default router;
