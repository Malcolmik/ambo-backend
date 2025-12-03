import { Router } from "express";
import {
  getMyNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearAllNotifications,
} from "./notifications.controller";
import { authRequired } from "../../middleware/auth";

const router = Router();

// Get user's notifications
router.get("/my", authRequired, getMyNotifications);

// Mark specific notification as read
router.patch("/:id/read", authRequired, markAsRead);

// Mark all notifications as read
router.patch("/read-all", authRequired, markAllAsRead);

// Delete specific notification
router.delete("/:id", authRequired, deleteNotification);

// Clear all notifications
router.delete("/clear-all", authRequired, clearAllNotifications);

export default router;
