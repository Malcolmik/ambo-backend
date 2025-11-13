import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthedRequest } from "../../middleware/auth";
import { success, fail } from "../../utils/response";

/**
 * GET /api/notifications
 * Get notifications for the authenticated user
 */
export async function listNotifications(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    const { unreadOnly } = req.query;

    const notifications = await prisma.notification.findMany({
      where: {
        userId: req.user.id,
        ...(unreadOnly === "true" ? { readAt: null } : {}),
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 50, // Limit to last 50 notifications
    });

    return success(res, notifications);
  } catch (err: any) {
    console.error("listNotifications error:", err);
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

    // Check notification exists and belongs to user
    const notification = await prisma.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      return fail(res, "Notification not found", 404);
    }

    if (notification.userId !== req.user.id) {
      return fail(res, "Forbidden", 403);
    }

    // Mark as read
    const updated = await prisma.notification.update({
      where: { id },
      data: {
        readAt: new Date(),
      },
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

    await prisma.notification.updateMany({
      where: {
        userId: req.user.id,
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });

    return success(res, { message: "All notifications marked as read" });
  } catch (err: any) {
    console.error("markAllAsRead error:", err);
    return fail(res, "Failed to mark all notifications as read", 500);
  }
}

/**
 * GET /api/notifications/unread-count
 * Get count of unread notifications
 */
export async function getUnreadCount(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    const count = await prisma.notification.count({
      where: {
        userId: req.user.id,
        readAt: null,
      },
    });

    return success(res, { count });
  } catch (err: any) {
    console.error("getUnreadCount error:", err);
    return fail(res, "Failed to get unread count", 500);
  }
}
