import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthedRequest } from "../../middleware/auth";
import { success, fail } from "../../utils/response";

// GET /activity
export async function listActivity(req: AuthedRequest, res: Response) {
  const { role, id } = req.user!;

  if (role === "SUPER_ADMIN") {
    const all = await prisma.auditLog.findMany({
      orderBy: { timestamp: "desc" },
      take: 100,
      include: {
        user: { select: { id: true, name: true, role: true } },
      },
    });
    return success(res, all);
  }

  if (role === "WORKER") {
    const mine = await prisma.auditLog.findMany({
      where: { userId: id },
      orderBy: { timestamp: "desc" },
      take: 100,
      include: {
        user: { select: { id: true, name: true, role: true } },
      },
    });
    return success(res, mine);
  }

  if (role === "CLIENT_VIEWER") {
    const client = await prisma.client.findFirst({
      where: { linkedUserId: id },
    });
    if (!client) return fail(res, "No client", 404);

    const tasks = await prisma.task.findMany({
      where: { clientId: client.id },
      select: { id: true },
    });
    const taskIds = tasks.map((t) => t.id);

    const relevant = await prisma.auditLog.findMany({
      where: {
        entityType: "TASK",
        entityId: { in: taskIds },
      },
      orderBy: { timestamp: "desc" },
      take: 100,
      include: {
        user: { select: { id: true, name: true, role: true } },
      },
    });

    return success(res, relevant);
  }

  return fail(res, "Forbidden", 403);
}
