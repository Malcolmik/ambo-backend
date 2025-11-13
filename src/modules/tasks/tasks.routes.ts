import { Router } from "express";
import {
  listTasks,
  getTask,
  createTask,
  updateTask,
  updateTaskStatus, // optional if you're keeping both endpoints
} from "./tasks.controller";
import { authRequired } from "../../middleware/auth";
import { requireRole } from "../../middleware/requireRole";

const router = Router();

router.get("/", authRequired, listTasks);
router.get("/:id", authRequired, getTask);

router.post(
  "/",
  authRequired,
  requireRole("SUPER_ADMIN"),
  createTask
);

// generic task edit (title, description, priority, dueDate, assignee, status)
router.patch(
  "/:id",
  authRequired,
  updateTask
);

// legacy status-only update (can keep or remove)
router.patch(
  "/:id/status",
  authRequired,
  updateTaskStatus
);

export default router;
