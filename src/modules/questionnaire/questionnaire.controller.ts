import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthedRequest } from "../../middleware/auth";
import { success, fail } from "../../utils/response";

/**
 * POST /api/questionnaire
 * Submit questionnaire responses for a contract
 */
export async function submitQuestionnaire(req: AuthedRequest, res: Response) {
  try {
    const { contractId, responses } = req.body;

    if (!contractId || !responses) {
      return fail(res, "contractId and responses are required", 400);
    }

    // Find contract
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      include: { client: true },
    });

    if (!contract) {
      return fail(res, "Contract not found", 404);
    }

    // Check authorization
    if (req.user?.role === "CLIENT_VIEWER") {
      const client = await prisma.client.findFirst({
        where: { linkedUserId: req.user.id },
      });

      if (!client || client.id !== contract.clientId) {
        return fail(res, "Forbidden", 403);
      }
    } else if (req.user?.role !== "SUPER_ADMIN") {
      return fail(res, "Forbidden", 403);
    }

    // Check if questionnaire already exists
    const existing = await prisma.questionnaire.findUnique({
      where: { contractId },
    });

    if (existing) {
      return fail(res, "Questionnaire already submitted for this contract", 409);
    }

    // Check if contract is in correct status
    if (contract.status !== "AWAITING_QUESTIONNAIRE") {
      return fail(
        res,
        `Cannot submit questionnaire. Contract status is ${contract.status}`,
        400
      );
    }

    // Create questionnaire
    const questionnaire = await prisma.questionnaire.create({
      data: {
        contractId,
        responses,
      },
    });

    // Update contract status
    await prisma.contract.update({
      where: { id: contractId },
      data: {
        status: "READY_FOR_ASSIGNMENT",
      },
    });

    // Notify super admins
    const superAdmins = await prisma.user.findMany({
      where: { role: "SUPER_ADMIN", active: true },
      select: { id: true },
    });

    for (const admin of superAdmins) {
      await prisma.notification.create({
        data: {
          userId: admin.id,
          type: "QUESTIONNAIRE_SUBMITTED",
          title: "New Questionnaire Submitted",
          body: `${contract.client.companyName} has submitted their project questionnaire. Contract ID: ${contractId}`,
        },
      });
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        actionType: "QUESTIONNAIRE_SUBMITTED",
        entityType: "CONTRACT",
        entityId: contractId,
        metaJson: {
          questionnaireId: questionnaire.id,
        },
      },
    });

    return success(res, questionnaire, 201);
  } catch (err: any) {
    console.error("submitQuestionnaire error:", err);
    return fail(res, "Failed to submit questionnaire", 500);
  }
}

/**
 * GET /api/questionnaire/:contractId
 * Retrieve questionnaire for a contract
 */
export async function getQuestionnaire(req: AuthedRequest, res: Response) {
  try {
    const { contractId } = req.params;

    // Find contract with questionnaire
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      include: {
        questionnaire: true,
        client: true,
      },
    });

    if (!contract) {
      return fail(res, "Contract not found", 404);
    }

    if (!contract.questionnaire) {
      return fail(res, "Questionnaire not found for this contract", 404);
    }

    // Check authorization
    if (req.user?.role === "CLIENT_VIEWER") {
      const client = await prisma.client.findFirst({
        where: { linkedUserId: req.user.id },
      });

      if (!client || client.id !== contract.clientId) {
        return fail(res, "Forbidden", 403);
      }
    } else if (req.user?.role === "WORKER") {
      // Workers can see questionnaires for contracts they're working on
      const hasTask = await prisma.task.findFirst({
        where: {
          assignedToId: req.user.id,
          clientId: contract.clientId,
        },
      });

      if (!hasTask) {
        return fail(res, "Forbidden", 403);
      }
    } else if (req.user?.role !== "SUPER_ADMIN") {
      return fail(res, "Forbidden", 403);
    }

    return success(res, {
      questionnaire: contract.questionnaire,
      contract: {
        id: contract.id,
        packageType: contract.packageType,
        status: contract.status,
        client: {
          id: contract.client.id,
          companyName: contract.client.companyName,
        },
      },
    });
  } catch (err: any) {
    console.error("getQuestionnaire error:", err);
    return fail(res, "Failed to retrieve questionnaire", 500);
  }
}
