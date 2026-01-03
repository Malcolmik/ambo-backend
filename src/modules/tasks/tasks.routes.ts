import { Router } from "express";
import {
  listTasks,
  getMyTasks,
  getTask,
  createTask,
  updateTask,
  updateTaskStatus,
  acceptTask,
  declineTask,
  completeTask,
} from "./tasks.controller";
import { authRequired } from "../../middleware/auth";
import { requireRole } from "../../middleware/requireRole";

const router = Router();

// Specific worker routes (MUST come before /:id routes)
router.get("/my", authRequired, getMyTasks); // Get worker's assigned tasks
router.post("/:taskId/accept", authRequired, acceptTask); // Worker accepts task
router.post("/:taskId/decline", authRequired, declineTask); // Worker declines task
router.post("/:taskId/complete", authRequired, completeTask); // Worker completes task

// List tasks (role-based)
router.get("/", authRequired, listTasks);

// Get single task
router.get("/:id", authRequired, getTask);

// Create task - UPDATED: Added ADMIN role
router.post(
  "/",
  authRequired,
  requireRole("SUPER_ADMIN", "ADMIN"),
  createTask
);

// Update task (general)
router.patch("/:id", authRequired, updateTask);

// Update task status (legacy - can keep or remove)
router.patch("/:id/status", authRequired, updateTaskStatus);

export default router;
