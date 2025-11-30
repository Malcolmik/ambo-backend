import { Response } from "express";
import { prisma } from "../../config/prisma";
import { success, fail } from "../../utils/response";
import { AuthedRequest } from "../../middleware/auth";

// GET /clients
/**
 * Lists clients based on the authenticated user's role.
 */
export async function listClients(req: AuthedRequest, res: Response) {
  if (req.user?.role === "SUPER_ADMIN") {
    const all = await prisma.client.findMany({
      include: { tasks: true },
    });
    return success(res, all);
  }

  if (req.user?.role === "WORKER") {
    const myClients = await prisma.client.findMany({
      where: {
        tasks: {
          some: {
            assignedToId: req.user.id,
          },
        },
      },
      include: { tasks: true },
    });
    return success(res, myClients);
  }

  if (req.user?.role === "CLIENT_VIEWER") {
    const client = await prisma.client.findFirst({
      where: {
        linkedUserId: req.user.id,
      },
      include: { tasks: true },
    });
    if (!client) return fail(res, "No client profile", 404);
    // Since CLIENT_VIEWER should only see their own client, we return a single object, not an array.
    return success(res, client); 
  }

  return fail(res, "Forbidden", 403);
}

// POST /clients (SUPER_ADMIN only)
/**
 * Creates a new client record.
 */
export async function createClient(req: AuthedRequest, res: Response) {
  const {
    companyName,
    contactPerson,
    email,
    phone,
    whatsapp,
    status,
    notes,
    linkedUserId
  } = req.body;

  try {
    const created = await prisma.client.create({
      data: {
        companyName,
        contactPerson,
        email,
        phone,
        whatsapp,
        status,
        notes,
        linkedUserId: linkedUserId || undefined, // Allow linking during creation
      },
    });

    return success(res, created, 201);
  } catch (err: any) {
    console.error("createClient error:", err);
    return fail(res, "Failed to create client", 500);
  }
}

// GET /clients/:id
/**
 * Retrieves a single client by ID.
 */
export async function getClient(req: AuthedRequest, res: Response) {
  const { id } = req.params;

  try {
    const client = await prisma.client.findUnique({
      where: { id },
      include: { tasks: true, linkedUser: true }
    });

    if (!client) {
      return fail(res, "Client not found", 404);
    }

    // Basic Authorization Check
    const user = req.user;
    if (user?.role === "CLIENT_VIEWER" && client.linkedUserId !== user.id) {
        return fail(res, "Forbidden", 403);
    }
    
    return success(res, client);
  } catch (err: any) {
    console.error("getClient error:", err);
    return fail(res, "Failed to retrieve client", 500);
  }
}


// PATCH /clients/:id (SUPER_ADMIN only)
/**
 * Updates a client record.
 */
export async function updateClient(req: AuthedRequest, res: Response) {
  const { id } = req.params;
  const updateData = req.body;

  try {
    const existingClient = await prisma.client.findUnique({ where: { id } });
    if (!existingClient) {
      return fail(res, "Client not found", 404);
    }

    const updatedClient = await prisma.client.update({
      where: { id },
      data: updateData,
    });
    
    try {
        if (req.user?.id) {
            await prisma.auditLog.create({
                data: {
                    userId: req.user.id,
                    actionType: "CLIENT_UPDATE",
                    entityType: "CLIENT",
                    entityId: id,
                    metaJson: {
                        changes: updateData,
                    },
                },
            });
        }
    } catch (logErr) {
        console.warn("Failed to create audit log for client update:", logErr);
    }

    return success(res, updatedClient);

  } catch (err: any) {
    console.error("updateClient error:", err);
    return fail(res, "Failed to update client", 500);
  }
}

/**
 * POST /api/clients/assign
 * Assign a client to a worker (Super Admin only)
 */
export async function assignClientToWorker(req: AuthedRequest, res: Response) {
  try {
    const { clientId, workerId } = req.body;

    if (!clientId || !workerId) {
      return fail(res, "clientId and workerId are required", 400);
    }

    if (req.user?.role !== "SUPER_ADMIN") {
      return fail(res, "Forbidden: Only Super Admins can assign clients", 403);
    }

    // Check if client exists
    const client = await prisma.client.findUnique({
      where: { id: clientId },
    });

    if (!client) {
      return fail(res, "Client not found", 404);
    }

    // Check if worker exists
    const worker = await prisma.user.findUnique({
      where: { id: workerId },
    });

    if (!worker) {
      return fail(res, "Worker not found", 404);
    }

    // Assign by creating a high-priority TASK
    const assignmentTask = await prisma.task.create({
      data: {
        title: `Manage Client: ${client.companyName}`,
        description: `You have been assigned to manage account operations for ${client.companyName}. Please review their contract and onboard them.`,
        priority: "HIGH",
        // status: "PENDING", // REMOVED: Using database default (likely "TODO" or "OPEN") to avoid type mismatch
        clientId: clientId,
        assignedToId: workerId,
        createdById: req.user.id,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Due in 1 week
      }
    });

    // Notification for the worker
    await prisma.notification.create({
      data: {
        userId: workerId,
        type: "TASK_ASSIGNED",
        title: "New Client Assignment",
        body: `You have been assigned to manage ${client.companyName}.`,
      },
    });

    // Audit Log
    try {
        await prisma.auditLog.create({
            data: {
                userId: req.user.id,
                actionType: "CLIENT_ASSIGNED",
                entityType: "CLIENT",
                entityId: clientId,
                metaJson: { workerId, workerName: worker.name, assignmentTaskId: assignmentTask.id }
            }
        });
    } catch (e) {
        console.warn("Audit log failed for assignment", e);
    }

    return success(res, { message: "Client assigned successfully (Task created)", task: assignmentTask });

  } catch (err: any) {
    console.error("assignClientToWorker error:", err);
    return fail(res, "Failed to assign client", 500);
  }
}

/**
 * GET /api/clients/all (Helper for dropdowns)
 * List all clients for assignment
 */
export async function getClients(req: AuthedRequest, res: Response) {
    try {
        if (req.user?.role !== "SUPER_ADMIN") {
             return fail(res, "Forbidden", 403);
        }
        
        const clients = await prisma.client.findMany({
            select: { id: true, companyName: true, email: true, status: true },
            orderBy: { companyName: 'asc' }
        });
        return success(res, clients);
    } catch (err) {
        return fail(res, "Failed to fetch clients", 500);
    }
}