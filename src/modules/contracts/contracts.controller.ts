import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthedRequest } from "../../middleware/auth";
import { success, fail } from "../../utils/response";

/**
 * GET /api/contracts/my
 * Get contracts for the authenticated user (CLIENT_VIEWER or SUPER_ADMIN)
 */
export async function myContracts(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    if (req.user.role === "SUPER_ADMIN") {
      // Super admin sees all contracts
      const contracts = await prisma.contract.findMany({
        include: {
          client: true,
          questionnaire: true,
          payments: {
            orderBy: { createdAt: "desc" },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      return success(res, contracts);
    }

    if (req.user.role === "CLIENT_VIEWER") {
      // Client viewer sees their own contracts
      const client = await prisma.client.findFirst({
        where: { linkedUserId: req.user.id },
      });

      if (!client) {
        return success(res, []); // No contracts yet
      }

      const contracts = await prisma.contract.findMany({
        where: { clientId: client.id },
        include: {
          client: true,
          questionnaire: true,
          payments: {
            orderBy: { createdAt: "desc" },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      return success(res, contracts);
    }

    return fail(res, "Forbidden", 403);
  } catch (err: any) {
    console.error("myContracts error:", err);
    return fail(res, "Failed to retrieve contracts", 500);
  }
}

/**
 * GET /api/contracts/:id
 * Get a specific contract with full details
 */
export async function getContract(req: AuthedRequest, res: Response) {
  try {
    const { id } = req.params;

    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    const contract = await prisma.contract.findUnique({
      where: { id },
      include: {
        client: true,
        questionnaire: true,
        payments: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!contract) {
      return fail(res, "Contract not found", 404);
    }

    // Check authorization
    if (req.user.role === "CLIENT_VIEWER") {
      const client = await prisma.client.findFirst({
        where: { linkedUserId: req.user.id },
      });

      if (!client || client.id !== contract.clientId) {
        return fail(res, "Forbidden", 403);
      }
    } else if (req.user.role !== "SUPER_ADMIN") {
      return fail(res, "Forbidden", 403);
    }

    return success(res, contract);
  } catch (err: any) {
    console.error("getContract error:", err);
    return fail(res, "Failed to retrieve contract", 500);
  }
}

/**
 * GET /api/contracts/:id/tasks
 * Get tasks associated with a contract
 */
export async function getContractTasks(req: AuthedRequest, res: Response) {
  try {
    const { id } = req.params;

    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    const contract = await prisma.contract.findUnique({
      where: { id },
      include: { client: true },
    });

    if (!contract) {
      return fail(res, "Contract not found", 404);
    }

    // Check authorization
    if (req.user.role === "CLIENT_VIEWER") {
      const client = await prisma.client.findFirst({
        where: { linkedUserId: req.user.id },
      });

      if (!client || client.id !== contract.clientId) {
        return fail(res, "Forbidden", 403);
      }
    } else if (req.user.role !== "SUPER_ADMIN") {
      return fail(res, "Forbidden", 403);
    }

    // Get tasks for this contract's client
    const tasks = await prisma.task.findMany({
      where: { clientId: contract.clientId },
      include: {
        assignedTo: {
          select: { id: true, name: true, email: true },
        },
        updates: {
          orderBy: { timestamp: "desc" },
          take: 5,
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return success(res, tasks);
  } catch (err: any) {
    console.error("getContractTasks error:", err);
    return fail(res, "Failed to retrieve contract tasks", 500);
  }
}

/**
 * PATCH /api/contracts/:id/status
 * Update contract status (SUPER_ADMIN only)
 */
export async function updateContractStatus(req: AuthedRequest, res: Response) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!req.user || req.user.role !== "SUPER_ADMIN") {
      return fail(res, "Forbidden", 403);
    }

    const contract = await prisma.contract.findUnique({
      where: { id },
    });

    if (!contract) {
      return fail(res, "Contract not found", 404);
    }

    const updated = await prisma.contract.update({
      where: { id },
      data: { status },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        actionType: "CONTRACT_STATUS_UPDATE",
        entityType: "CONTRACT",
        entityId: id,
        metaJson: {
          oldStatus: contract.status,
          newStatus: status,
        },
      },
    });

    return success(res, updated);
  } catch (err: any) {
    console.error("updateContractStatus error:", err);
    return fail(res, "Failed to update contract status", 500);
  }
}
