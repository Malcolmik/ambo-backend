import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthedRequest } from "../../middleware/auth";
import { success, fail } from "../../utils/response";

/**
 * GET /api/chats/debug/worker-assignments
 * Debug endpoint to see what tasks are assigned to the current worker
 * REMOVE THIS AFTER DEBUGGING
 */
export async function debugWorkerAssignments(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    // Get user info
    const userInfo = {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
    };

    // Find all tasks assigned to this user
    const assignedTasks = await prisma.task.findMany({
      where: {
        assignedToId: req.user.id,
      },
      include: {
        client: {
          select: {
            id: true,
            companyName: true,
            linkedUserId: true,
          },
        },
        contract: {
          select: {
            id: true,
            clientId: true,
          },
        },
      },
    });

    // Find all contracts where this user has tasks
    const contractsWithUserTasks = await prisma.contract.findMany({
      where: {
        tasks: {
          some: {
            assignedToId: req.user.id,
          },
        },
      },
      include: {
        client: {
          select: {
            id: true,
            companyName: true,
            linkedUserId: true,
          },
        },
      },
    });

    // Get all clients that have linkedUserId (can be chatted with)
    const clientsWithUsers = await prisma.client.findMany({
      where: {
        linkedUserId: { not: null },
      },
      select: {
        id: true,
        companyName: true,
        linkedUserId: true,
      },
    });

    return success(res, {
      user: userInfo,
      assignedTasks: assignedTasks.map(t => ({
        taskId: t.id,
        taskTitle: t.title,
        directClientId: t.clientId,
        directClientName: t.client?.companyName,
        directClientLinkedUserId: t.client?.linkedUserId,
        contractId: t.contractId,
        contractClientId: t.contract?.clientId,
      })),
      contractsWithUserTasks: contractsWithUserTasks.map(c => ({
        contractId: c.id,
        clientId: c.clientId,
        clientName: c.client?.companyName,
        clientLinkedUserId: c.client?.linkedUserId,
      })),
      allClientsWithLinkedUsers: clientsWithUsers,
      summary: {
        totalAssignedTasks: assignedTasks.length,
        totalContractsWithTasks: contractsWithUserTasks.length,
        totalClientsWithLinkedUsers: clientsWithUsers.length,
      },
    });
  } catch (err: any) {
    console.error("debugWorkerAssignments error:", err);
    return fail(res, "Debug failed: " + err.message, 500);
  }
}
