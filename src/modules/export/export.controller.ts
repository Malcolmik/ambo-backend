import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthedRequest } from "../../middleware/auth";
import { success, fail } from "../../utils/response";

/**
 * GET /api/export/clients
 * Export all clients data (SUPER_ADMIN only)
 */
export async function exportClients(req: AuthedRequest, res: Response) {
  try {
    if (!req.user || req.user.role !== "SUPER_ADMIN") {
      return fail(res, "Forbidden: Only super admins can export data", 403);
    }

    const clients = await prisma.client.findMany({
      include: {
        linkedUser: {
          select: { id: true, name: true, email: true },
        },
        contracts: {
          select: { id: true, packageType: true, status: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Transform for export
    const exportData = clients.map((client) => ({
      id: client.id,
      companyName: client.companyName,
      email: client.email,
      phone: client.phone || "",
      linkedUserName: client.linkedUser?.name || "",
      linkedUserEmail: client.linkedUser?.email || "",
      totalContracts: client.contracts.length,
      createdAt: client.createdAt,
      updatedAt: client.updatedAt,
    }));

    return success(res, {
      data: exportData,
      count: exportData.length,
      exportedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("exportClients error:", err);
    return fail(res, "Failed to export clients", 500);
  }
}

/**
 * GET /api/export/contracts
 * Export all contracts data (SUPER_ADMIN only)
 */
export async function exportContracts(req: AuthedRequest, res: Response) {
  try {
    if (!req.user || req.user.role !== "SUPER_ADMIN") {
      return fail(res, "Forbidden: Only super admins can export data", 403);
    }

    const contracts = await prisma.contract.findMany({
      include: {
        client: {
          select: { id: true, companyName: true, email: true },
        },
        questionnaire: {
          select: { id: true, createdAt: true },
        },
        payments: {
          select: { id: true, amount: true, status: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Transform for export
    const exportData = contracts.map((contract) => ({
      id: contract.id,
      clientName: contract.client.companyName,
      clientEmail: contract.client.email,
      packageType: contract.packageType,
      services: contract.services,
      totalPrice: contract.totalPrice,
      currency: contract.currency,
      status: contract.status,
      paymentStatus: contract.paymentStatus,
      hasQuestionnaire: !!contract.questionnaire,
      questionnaireSubmittedAt: contract.questionnaire?.createdAt || null,
      totalPayments: contract.payments.length,
      createdAt: contract.createdAt,
      updatedAt: contract.updatedAt,
    }));

    return success(res, {
      data: exportData,
      count: exportData.length,
      exportedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("exportContracts error:", err);
    return fail(res, "Failed to export contracts", 500);
  }
}

/**
 * GET /api/export/tasks
 * Export all tasks data (SUPER_ADMIN only)
 */
export async function exportTasks(req: AuthedRequest, res: Response) {
  try {
    if (!req.user || req.user.role !== "SUPER_ADMIN") {
      return fail(res, "Forbidden: Only super admins can export data", 403);
    }

    const tasks = await prisma.task.findMany({
      include: {
        client: {
          select: { id: true, companyName: true },
        },
        assignedTo: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Transform for export
    const exportData = tasks.map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      clientName: task.client?.companyName || "",
      assignedToName: task.assignedTo?.name || "Unassigned",
      assignedToEmail: task.assignedTo?.email || "",
      dueDate: task.dueDate,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    }));

    return success(res, {
      data: exportData,
      count: exportData.length,
      exportedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("exportTasks error:", err);
    return fail(res, "Failed to export tasks", 500);
  }
}

/**
 * GET /api/export/users
 * Export all users data (SUPER_ADMIN only)
 */
export async function exportUsers(req: AuthedRequest, res: Response) {
  try {
    if (!req.user || req.user.role !== "SUPER_ADMIN") {
      return fail(res, "Forbidden: Only super admins can export data", 403);
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        active: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // Transform for export (exclude sensitive data)
    const exportData = users.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      active: user.active,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }));

    return success(res, {
      data: exportData,
      count: exportData.length,
      exportedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("exportUsers error:", err);
    return fail(res, "Failed to export users", 500);
  }
}

/**
 * GET /api/export/payments
 * Export all payments data (SUPER_ADMIN only)
 */
export async function exportPayments(req: AuthedRequest, res: Response) {
  try {
    if (!req.user || req.user.role !== "SUPER_ADMIN") {
      return fail(res, "Forbidden: Only super admins can export data", 403);
    }

    const payments = await prisma.payment.findMany({
      include: {
        contract: {
          include: {
            client: {
              select: { companyName: true, email: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Transform for export
    const exportData = payments.map((payment) => ({
      id: payment.id,
      clientName: payment.contract?.client?.companyName || "",
      clientEmail: payment.contract?.client?.email || "",
      packageType: payment.contract?.packageType || "",
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      paystackReference: payment.paystackReference,
      paidAt: payment.paidAt,
      createdAt: payment.createdAt,
    }));

    return success(res, {
      data: exportData,
      count: exportData.length,
      exportedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("exportPayments error:", err);
    return fail(res, "Failed to export payments", 500);
  }
}

/**
 * GET /api/export/questionnaires
 * Export all questionnaire responses (SUPER_ADMIN only)
 */
export async function exportQuestionnaires(req: AuthedRequest, res: Response) {
  try {
    if (!req.user || req.user.role !== "SUPER_ADMIN") {
      return fail(res, "Forbidden: Only super admins can export data", 403);
    }

    const questionnaires = await prisma.questionnaire.findMany({
      include: {
        contract: {
          include: {
            client: {
              select: { companyName: true, email: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Transform for export
    const exportData = questionnaires.map((q) => ({
      id: q.id,
      contractId: q.contractId,
      clientName: q.contract?.client?.companyName || "",
      clientEmail: q.contract?.client?.email || "",
      packageType: q.contract?.packageType || "",
      responses: q.responses, // Full JSON responses
      createdAt: q.createdAt,
      updatedAt: q.updatedAt,
    }));

    return success(res, {
      data: exportData,
      count: exportData.length,
      exportedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("exportQuestionnaires error:", err);
    return fail(res, "Failed to export questionnaires", 500);
  }
}

/**
 * GET /api/export/audit-logs
 * Export audit logs (SUPER_ADMIN only)
 */
export async function exportAuditLogs(req: AuthedRequest, res: Response) {
  try {
    if (!req.user || req.user.role !== "SUPER_ADMIN") {
      return fail(res, "Forbidden: Only super admins can export data", 403);
    }

    const logs = await prisma.auditLog.findMany({
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { timestamp: "desc" },
      take: 10000, // Limit to last 10k logs
    });

    // Transform for export
    const exportData = logs.map((log) => ({
      id: log.id,
      userName: log.user?.name || "",
      userEmail: log.user?.email || "",
      actionType: log.actionType,
      entityType: log.entityType,
      entityId: log.entityId,
      metadata: log.metaJson,
      timestamp: log.timestamp,
    }));

    return success(res, {
      data: exportData,
      count: exportData.length,
      exportedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("exportAuditLogs error:", err);
    return fail(res, "Failed to export audit logs", 500);
  }
}
