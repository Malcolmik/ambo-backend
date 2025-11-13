import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthedRequest } from "../../middleware/auth";
import { success, fail } from "../../utils/response";

// GET /tasks/:taskId/comments
export async function listComments(req: AuthedRequest, res: Response) {
  const { taskId } = req.params;

  const comments = await prisma.taskComment.findMany({
    where: { taskId },
    include: {
      user: { select: { id: true, name: true, role: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return success(res, comments);
}

// POST /tasks/:taskId/comments
export async function addComment(req: AuthedRequest, res: Response) {
  const { taskId } = req.params;
  const { content } = req.body;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
  });
  if (!task) return fail(res, "Task not found", 404);

  if (req.user?.role === "SUPER_ADMIN") {
    // allowed
  } else if (req.user?.role === "WORKER") {
    if (task.assignedToId !== req.user.id) {
      return fail(res, "Forbidden", 403);
    }
  } else if (req.user?.role === "CLIENT_VIEWER") {
    const client = await prisma.client.findFirst({
      where: { linkedUserId: req.user.id },
    });
    if (!client || client.id !== task.clientId) {
      return fail(res, "Forbidden", 403);
    }
  } else {
    return fail(res, "Forbidden", 403);
  }

  const created = await prisma.taskComment.create({
    data: {
      taskId,
      userId: req.user!.id,
      content,
      isClientComment: req.user!.role === "CLIENT_VIEWER",
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: req.user!.id,
      actionType: "TASK_COMMENT_ADDED",
      entityType: "TASK",
      entityId: taskId,
      metaJson: {
        content,
      } as any,
    },
  });

  return success(res, created, 201);
}
