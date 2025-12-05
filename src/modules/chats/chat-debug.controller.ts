import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthedRequest } from "../../middleware/auth";
import { success, fail } from "../../utils/response";

/**
 * GET /api/chats/debug/worker-assignments
 * Debug endpoint to see what clients a worker has access to
 * TEMPORARY - Remove after debugging
 */
export async function debugWorkerAssignments(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    const workerId = req.user.id;

    // Check 1: Tasks assigned to worker
    const assignedTasks = await prisma.task.findMany({
      where: { assignedToId: workerId },
      select: {
        id: true,
        title: true,
        status: true,
        contractId: true,
        contract: {
          select: {
            id: true,
            packageType: true,
            client: {
              select: {
                id: true,
                companyName: true,
                contactPerson: true,
              },
            },
          },
        },
      },
    });

    // Check 2: All contracts with their clients
    const allContracts = await prisma.contract.findMany({
      select: {
        id: true,
        packageType: true,
        status: true,
        client: {
          select: {
            id: true,
            companyName: true,
            linkedUserId: true,
          },
        },
        tasks: {
          where: { assignedToId: workerId },
          select: {
            id: true,
            title: true,
            status: true,
          },
        },
      },
    });

    // Check 3: User details
    const userDetails = await prisma.user.findUnique({
      where: { id: workerId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });

    return success(res, {
      debug: {
        workerId,
        userDetails,
        assignedTasks,
        totalTasksAssigned: assignedTasks.length,
        allContracts: allContracts.filter((c) => c.tasks.length > 0),
        totalContractsWithTasks: allContracts.filter((c) => c.tasks.length > 0).length,
      },
    });
  } catch (err: any) {
    console.error("debugWorkerAssignments error:", err);
    return fail(res, "Failed to debug worker assignments", 500);
  }
}