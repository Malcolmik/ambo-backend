import { Router } from "express";
import {
  listNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
} from "./notifications.controller";
import { authRequired } from "../../middleware/auth";

const router = Router();

router.get("/", authRequired, listNotifications);
router.get("/unread-count", authRequired, getUnreadCount);
router.patch("/read-all", authRequired, markAllAsRead);
router.patch("/:id/read", authRequired, markAsRead);

export default router;
