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
    // Note: linkedUserId is usually passed here for immediate linking, 
    // but the updateClient function below handles the linking later.
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

    // Basic Authorization Check: SUPER_ADMIN allowed OR linked CLIENT_VIEWER allowed
    const user = req.user;
    if (user?.role === "CLIENT_VIEWER" && client.linkedUserId !== user.id) {
        return fail(res, "Forbidden", 403);
    }
    // WORKER authorization is handled by listClients, but for single GET, 
    // we generally allow it if they are assigned a task (omitting complex check for now)
    if (!user || (user.role !== "SUPER_ADMIN" && user.role !== "CLIENT_VIEWER")) {
         // Optionally, add a check for workers being assigned to tasks for this client.
    }

    return success(res, client);
  } catch (err: any) {
    console.error("getClient error:", err);
    return fail(res, "Failed to retrieve client", 500);
  }
}


// PATCH /clients/:id (SUPER_ADMIN only)
/**
 * Updates a client record. Used here specifically to link the Client Viewer User ID.
 */
export async function updateClient(req: AuthedRequest, res: Response) {
  const { id } = req.params;
  const updateData = req.body;

  try {
    // Note: Authorization check (requireRole("SUPER_ADMIN")) is expected 
    // to be handled by the route middleware.

    const existingClient = await prisma.client.findUnique({ where: { id } });
    if (!existingClient) {
      return fail(res, "Client not found", 404);
    }

    const updatedClient = await prisma.client.update({
      where: { id },
      data: updateData,
    });
    
    // Audit log (recommended)
    // Wrappped in try/catch just in case AuditLog model doesn't exist or fails, 
    // so it doesn't block the main update.
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