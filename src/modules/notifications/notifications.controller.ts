import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthedRequest } from "../../middleware/auth";
import { success, fail } from "../../utils/response";

/**
 * GET /api/notifications/my
 * Get all notifications for the authenticated user
 */
export async function getMyNotifications(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    const notifications = await prisma.notification.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
      take: 100, // Last 100 notifications
    });

    const unreadCount = await prisma.notification.count({
      where: {
        userId: req.user.id,
        read: false,
      },
    });

    return success(res, {
      notifications,
      unreadCount,
      total: notifications.length,
    });
  } catch (err: any) {
    console.error("getMyNotifications error:", err);
    return fail(res, "Failed to retrieve notifications", 500);
  }
}

/**
 * PATCH /api/notifications/:id/read
 * Mark a notification as read
 */
export async function markAsRead(req: AuthedRequest, res: Response) {
  try {
    const { id } = req.params;

    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    // Check ownership
    const notification = await prisma.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      return fail(res, "Notification not found", 404);
    }

    if (notification.userId !== req.user.id) {
      return fail(res, "Forbidden", 403);
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: { read: true },
    });

    return success(res, updated);
  } catch (err: any) {
    console.error("markAsRead error:", err);
    return fail(res, "Failed to mark notification as read", 500);
  }
}

/**
 * PATCH /api/notifications/read-all
 * Mark all notifications as read for the authenticated user
 */
export async function markAllAsRead(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    const result = await prisma.notification.updateMany({
      where: {
        userId: req.user.id,
        read: false,
      },
      data: { read: true },
    });

    return success(res, {
      message: `Marked ${result.count} notifications as read`,
      count: result.count,
    });
  } catch (err: any) {
    console.error("markAllAsRead error:", err);
    return fail(res, "Failed to mark all notifications as read", 500);
  }
}

/**
 * DELETE /api/notifications/:id
 * Delete a notification
 */
export async function deleteNotification(req: AuthedRequest, res: Response) {
  try {
    const { id } = req.params;

    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    // Check ownership
    const notification = await prisma.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      return fail(res, "Notification not found", 404);
    }

    if (notification.userId !== req.user.id) {
      return fail(res, "Forbidden", 403);
    }

    await prisma.notification.delete({
      where: { id },
    });

    return success(res, { message: "Notification deleted successfully" });
  } catch (err: any) {
    console.error("deleteNotification error:", err);
    return fail(res, "Failed to delete notification", 500);
  }
}

/**
 * DELETE /api/notifications/clear-all
 * Delete all notifications for the authenticated user
 */
export async function clearAllNotifications(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    const result = await prisma.notification.deleteMany({
      where: { userId: req.user.id },
    });

    return success(res, {
      message: `Deleted ${result.count} notifications`,
      count: result.count,
    });
  } catch (err: any) {
    console.error("clearAllNotifications error:", err);
    return fail(res, "Failed to clear notifications", 500);
  }
}
