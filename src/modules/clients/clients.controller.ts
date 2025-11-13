import { Response } from "express";
import { prisma } from "../../config/prisma";
import { success, fail } from "../../utils/response";
import { AuthedRequest } from "../../middleware/auth";

// GET /clients
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
    return success(res, client);
  }

  return fail(res, "Forbidden", 403);
}

// POST /clients (SUPER_ADMIN only)
export async function createClient(req: AuthedRequest, res: Response) {
  const {
    companyName,
    contactPerson,
    email,
    phone,
    whatsapp,
    status,
    notes,
  } = req.body;

  const created = await prisma.client.create({
    data: {
      companyName,
      contactPerson,
      email,
      phone,
      whatsapp,
      status,
      notes,
    },
  });

  return success(res, created, 201);
}
