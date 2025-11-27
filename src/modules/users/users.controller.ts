import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthedRequest } from "../../middleware/auth";
import { success, fail } from "../../utils/response";

/**
 * GET /api/users
 * Get all users (SUPER_ADMIN only)
 */
export async function getAllUsers(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    if (req.user.role !== "SUPER_ADMIN") {
      return fail(res, "Forbidden: Only SUPER_ADMIN can view all users", 403);
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        active: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return success(res, users);
  } catch (err: any) {
    console.error("getAllUsers error:", err);
    return fail(res, "Failed to get users", 500);
  }
}

/**
 * GET /api/users/:id
 * Get a specific user (SUPER_ADMIN only)
 */
export async function getUser(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    if (req.user.role !== "SUPER_ADMIN") {
      return fail(res, "Forbidden: Only SUPER_ADMIN can view users", 403);
    }

    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        active: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return fail(res, "User not found", 404);
    }

    return success(res, user);
  } catch (err: any) {
    console.error("getUser error:", err);
    return fail(res, "Failed to get user", 500);
  }
}

/**
 * POST /api/users/:id/approve
 * Approve a CLIENT_VIEWER_PENDING user (SUPER_ADMIN only)
 * Changes role from CLIENT_VIEWER_PENDING to CLIENT_VIEWER
 */
export async function approveUser(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    if (req.user.role !== "SUPER_ADMIN") {
      return fail(res, "Forbidden: Only SUPER_ADMIN can approve users", 403);
    }

    const { id } = req.params;

    // Get the user to approve
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
      },
    });

    if (!user) {
      return fail(res, "User not found", 404);
    }

    // Check if user is CLIENT_VIEWER_PENDING
    if (user.role !== "CLIENT_VIEWER_PENDING") {
      return fail(res, "User is not pending approval", 400);
    }

    // Update user role to CLIENT_VIEWER
    const updatedUser = await prisma.user.update({
      where: { id },
      data: { role: "CLIENT_VIEWER" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        updatedAt: true,
      },
    });

    // Audit log
    try {
      await prisma.auditLog.create({
        data: {
          userId: req.user.id,
          actionType: "USER_APPROVED",
          entityType: "USER",
          entityId: updatedUser.id,
          metaJson: {
            approvedUserEmail: updatedUser.email,
            approvedUserName: updatedUser.name,
            oldRole: "CLIENT_VIEWER_PENDING",
            newRole: "CLIENT_VIEWER",
          },
        },
      });
    } catch (auditErr) {
      console.error("Audit log error:", auditErr);
      // Don't fail the request if audit log fails
    }

    return success(res, {
      message: "User approved successfully",
      user: updatedUser,
    });
  } catch (err: any) {
    console.error("approveUser error:", err);
    return fail(res, "Failed to approve user", 500);
  }
}

/**
 * POST /api/users/:id/reject
 * Reject a CLIENT_VIEWER_PENDING user (SUPER_ADMIN only)
 * Deactivates the user and their linked client
 */
export async function rejectUser(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    if (req.user.role !== "SUPER_ADMIN") {
      return fail(res, "Forbidden: Only SUPER_ADMIN can reject users", 403);
    }

    const { id } = req.params;
    const { reason } = req.body;

    // Get the user to reject
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
      },
    });

    if (!user) {
      return fail(res, "User not found", 404);
    }

    // Check if user is CLIENT_VIEWER_PENDING
    if (user.role !== "CLIENT_VIEWER_PENDING") {
      return fail(res, "User is not pending approval", 400);
    }

    // Deactivate user
    const updatedUser = await prisma.user.update({
      where: { id },
      data: { active: false },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
      },
    });

    // Audit log
    try {
      await prisma.auditLog.create({
        data: {
          userId: req.user.id,
          actionType: "USER_REJECTED",
          entityType: "USER",
          entityId: updatedUser.id,
          metaJson: {
            rejectedUserEmail: updatedUser.email,
            rejectedUserName: updatedUser.name,
            reason: reason || "No reason provided",
          },
        },
      });
    } catch (auditErr) {
      console.error("Audit log error:", auditErr);
      // Don't fail the request if audit log fails
    }

    return success(res, {
      message: "User rejected successfully",
      user: updatedUser,
    });
  } catch (err: any) {
    console.error("rejectUser error:", err);
    return fail(res, "Failed to reject user", 500);
  }
}

/**
 * PATCH /api/users/:id/toggle-active
 * Toggle user active status (SUPER_ADMIN only)
 */
export async function toggleUserActive(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    if (req.user.role !== "SUPER_ADMIN") {
      return fail(res, "Forbidden: Only SUPER_ADMIN can modify users", 403);
    }

    const { id } = req.params;

    // Get current user
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, active: true, role: true },
    });

    if (!user) {
      return fail(res, "User not found", 404);
    }

    // Don't allow deactivating yourself
    if (user.id === req.user.id) {
      return fail(res, "Cannot deactivate your own account", 400);
    }

    // Toggle active status
    const updatedUser = await prisma.user.update({
      where: { id },
      data: { active: !user.active },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
      },
    });

    // Audit log
    try {
      await prisma.auditLog.create({
        data: {
          userId: req.user.id,
          actionType: updatedUser.active ? "USER_ACTIVATED" : "USER_DEACTIVATED",
          entityType: "USER",
          entityId: updatedUser.id,
          metaJson: {
            userEmail: updatedUser.email,
            userName: updatedUser.name,
            previousStatus: user.active,
            newStatus: updatedUser.active,
          },
        },
      });
    } catch (auditErr) {
      console.error("Audit log error:", auditErr);
    }

    return success(res, updatedUser);
  } catch (err: any) {
    console.error("toggleUserActive error:", err);
    return fail(res, "Failed to toggle user status", 500);
  }
}