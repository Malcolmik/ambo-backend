import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthedRequest } from "../../middleware/auth";
import { success, fail } from "../../utils/response";
import {
  ensureSendbirdUser,
  ensureContractChannel,
  issueSendbirdSessionToken,
} from "../../services/sendbird.service";
// Import Enums
import { ContractStatus, PaymentStatus } from "@prisma/client";

// =========================================================
// NEW FUNCTION: Create Contract (POST /api/contracts)
// =========================================================
export async function createContract(req: AuthedRequest, res: Response) {
  try {
    const {
      clientId,
      packageType,
      services,
      totalPrice,
      currency,
      paymentStatus,
      status,
    } = req.body;

    // Basic validation
    if (!clientId || !packageType || !totalPrice) {
      return fail(res, "Client ID, package type, and total price are required", 400);
    }

    // 1. Handle Services (Convert to String to be safe)
    let servicesValue = services;
    if (Array.isArray(services)) {
      servicesValue = services.join(", "); 
    }

    // 2. Handle Enums Strictly
    // We use the imported Enum object to ensure validity.
    
    // Fix for 'undefined' error: Initialize with a guaranteed Enum value
    let dbStatus: ContractStatus = ContractStatus.IN_PROGRESS; // Default
    
    if (status && Object.values(ContractStatus).includes(status as ContractStatus)) {
        dbStatus = status as ContractStatus;
    }

    let dbPaymentStatus: PaymentStatus = PaymentStatus.PENDING; // Default
    
    if (paymentStatus && Object.values(PaymentStatus).includes(paymentStatus as PaymentStatus)) {
        dbPaymentStatus = paymentStatus as PaymentStatus;
    }

    const contract = await prisma.contract.create({
      data: {
        clientId,
        packageType,
        services: servicesValue, // Sending as String
        totalPrice: Number(totalPrice), // Ensure decimal compatibility
        currency,
        paymentStatus: dbPaymentStatus,
        status: dbStatus,
      },
    });

    return success(res, contract, 201);
  } catch (err: any) {
    console.error("createContract error:", err);
    // Return detailed error for debugging
    return res.status(500).json({
      success: false,
      message: "Failed to create contract",
      error: err.message,
      details: err.meta,
    });
  }
}

/**
 * GET /api/contracts
 * Get all contracts (SUPER_ADMIN only)
 */
export async function getAllContracts(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    // Only SUPER_ADMIN can view all contracts
    if (req.user.role !== "SUPER_ADMIN") {
      return fail(res, "Forbidden", 403);
    }

    const contracts = await prisma.contract.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        client: true,
        questionnaire: true,
        payments: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    return success(res, contracts);
  } catch (err: any) {
    console.error("getAllContracts error:", err);
    return fail(res, "Failed to load contracts", 500);
  }
}

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

/**
 * GET /api/contracts/:id/chat
 * Retrieves necessary information (Sendbird App ID, User ID, Session Token, Channel URL)
 * for the authenticated user to join the chat channel associated with a contract.
 * Ensures the user and the channel exist in Sendbird, and authorizes access based on user role.
 */
export async function getContractChatInfo(req: AuthedRequest, res: Response) {
  try {
    const { id } = req.params;
    const user = req.user;
    if (!user) return fail(res, "Unauthorized", 401);

    const contract = await prisma.contract.findUnique({
      where: { id },
      include: {
        client: {
          include: {
            linkedUser: true, // assuming this relation exists: Client.linkedUserId -> User
          },
        },
      },
    });

    if (!contract) return fail(res, "Contract not found", 404);

    const role = user.role;

    // 🔐 Authorisation:
    // SUPER_ADMIN: always allowed
    if (role === "CLIENT_VIEWER") {
      // Must be the linked user for this client
      const client = contract.client;
      if (!client?.linkedUser || client.linkedUser.id !== user.id) {
        return fail(res, "Forbidden", 403);
      }
    }

    if (role === "WORKER") {
      // Must have at least one task for this client
      const hasTask = await prisma.task.findFirst({
        where: {
          clientId: contract.clientId,
          assignedToId: user.id,
        },
      });
      if (!hasTask) {
        return fail(res, "Forbidden", 403);
      }
    }

    // At this point: SUPER_ADMIN OR allowed worker OR allowed client

    // Ensure current user exists in Sendbird
    await ensureSendbirdUser({
      id: user.id,
      name: user.name,
      email: user.email,
    });

    // Determine channel members: client user + all workers assigned at this client
    const members: string[] = [];

    // client
    const clientUser = contract.client?.linkedUser;
    if (clientUser) {
      await ensureSendbirdUser({
        id: clientUser.id,
        name: clientUser.name,
        email: clientUser.email,
      });
      members.push(clientUser.id);
    }

    // workers: distinct assignedToIds for this client
    const workerAssignments = await prisma.task.findMany({
      where: {
        clientId: contract.clientId,
        assignedToId: { not: null },
      },
      select: { assignedToId: true },
    });

    const workerIds = Array.from(
      new Set(workerAssignments.map((w) => w.assignedToId!).filter(Boolean))
    );

    if (workerIds.length) {
      const workers = await prisma.user.findMany({
        where: { id: { in: workerIds } },
        select: { id: true, name: true, email: true },
      });

      for (const w of workers) {
        await ensureSendbirdUser({
          id: w.id,
          name: w.name,
          email: w.email,
        });
        members.push(w.id);
      }
    }

    // Always include current user, just in case they weren't in members yet
    if (!members.includes(user.id)) {
      members.push(user.id);
    }

    // If no client user is linked yet, channel will still be created
    if (!members.length) {
      return fail(res, "No participants for chat", 400);
    }

    // Ensure channel exists and get channel URL
    let channelUrl = contract.chatChannelUrl;

    if (!channelUrl) {
      const name =
        contract.client?.companyName || `Contract ${contract.id}`;

      // This should return the full Sendbird channel object
      const channel = await ensureContractChannel(contract.id, name, members);

      // Store only the URL string in our DB
      channelUrl = channel.channel_url;

      await prisma.contract.update({
        where: { id: contract.id },
        data: { chatChannelUrl: channelUrl },
      });
    }

    // Issue a session token for this user
    const sessionToken = await issueSendbirdSessionToken(user.id);

    return success(res, {
      appId: process.env.SENDBIRD_APP_ID,
      userId: user.id,
      sessionToken,
      channelUrl,
    });
  } catch (err: any) {
    console.error("getContractChatInfo error:", err.response?.data || err.message);
    return fail(res, "Failed to get chat info", 500);
  }
}

/**
 * POST /api/contracts/sendbird-sync-user
 * Ensures a user (either the authenticated user or a specified user)
 * is registered/updated in the Sendbird system.
 */
export async function sendbirdSyncUser(req: AuthedRequest, res: Response) {
  try {
    const { userId } = req.body;

    // Default to the currently logged in user if userId isn't provided
    const idToSync = userId || req.user?.id;
    if (!idToSync) {
      return fail(res, "No userId provided and no authenticated user", 400);
    }

    const user = await prisma.user.findUnique({
      where: { id: idToSync },
      select: { id: true, name: true, email: true },
    });

    if (!user) {
      return fail(res, "User not found", 404);
    }

    // This helper should already be imported at the top of this file
    // and used in getContractChatInfo
    await ensureSendbirdUser({
      id: user.id,
      // Use nullish coalescing to provide a fallback nickname if name is null
      name: user.name ?? user.email ?? "AMBO User",
      email: user.email,
    });

    return success(res, { syncedUserId: user.id });
  } catch (err) {
    console.error("sendbirdSyncUser error:", err);
    return fail(res, "Failed to sync Sendbird user", 500);
  }
}