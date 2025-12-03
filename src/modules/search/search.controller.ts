import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthedRequest } from "../../middleware/auth";
import { success, fail } from "../../utils/response";

/**
 * GET /api/search?q=query&type=clients,contracts,tasks
 * Search across multiple entities
 */
export async function globalSearch(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    const { q, type } = req.query;

    if (!q || typeof q !== "string") {
      return fail(res, "Search query (q) is required", 400);
    }

    const query = q.trim();
    if (query.length < 2) {
      return fail(res, "Search query must be at least 2 characters", 400);
    }

    // Determine which types to search
    const searchTypes = type
      ? String(type).split(",").map((t) => t.trim())
      : ["clients", "contracts", "tasks"];

    const results: any = {
      query,
      clients: [],
      contracts: [],
      tasks: [],
    };

    // Only SUPER_ADMIN can search everything
    const isSuperAdmin = req.user.role === "SUPER_ADMIN";

    // Search Clients
    if (searchTypes.includes("clients") && isSuperAdmin) {
      results.clients = await prisma.client.findMany({
        where: {
          OR: [
            { companyName: { contains: query, mode: "insensitive" } },
            { email: { contains: query, mode: "insensitive" } },
            { phone: { contains: query, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          companyName: true,
          email: true,
          phone: true,
          createdAt: true,
        },
        take: 20,
      });
    }

    // Search Contracts
    if (searchTypes.includes("contracts")) {
      const contractWhere: any = {
        OR: [
          { packageType: { contains: query, mode: "insensitive" } },
          { services: { contains: query, mode: "insensitive" } },
          {
            client: {
              companyName: { contains: query, mode: "insensitive" },
            },
          },
        ],
      };

      // If CLIENT_VIEWER, only show their contracts
      if (req.user.role === "CLIENT_VIEWER") {
        const client = await prisma.client.findFirst({
          where: { linkedUserId: req.user.id },
        });

        if (client) {
          contractWhere.clientId = client.id;
        } else {
          contractWhere.clientId = "none"; // No results
        }
      }

      if (isSuperAdmin || req.user.role === "CLIENT_VIEWER") {
        results.contracts = await prisma.contract.findMany({
          where: contractWhere,
          select: {
            id: true,
            packageType: true,
            services: true,
            status: true,
            totalPrice: true,
            client: {
              select: {
                companyName: true,
              },
            },
            createdAt: true,
          },
          take: 20,
        });
      }
    }

    // Search Tasks
    if (searchTypes.includes("tasks")) {
      const taskWhere: any = {
        OR: [
          { title: { contains: query, mode: "insensitive" } },
          { description: { contains: query, mode: "insensitive" } },
        ],
      };

      // If WORKER, only show their tasks
      if (req.user.role === "WORKER") {
        taskWhere.assignedToId = req.user.id;
      }

      // If CLIENT_VIEWER, only show tasks for their contracts
      if (req.user.role === "CLIENT_VIEWER") {
        const client = await prisma.client.findFirst({
          where: { linkedUserId: req.user.id },
        });

        if (client) {
          taskWhere.clientId = client.id;
        } else {
          taskWhere.clientId = "none"; // No results
        }
      }

      results.tasks = await prisma.task.findMany({
        where: taskWhere,
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          priority: true,
          client: {
            select: {
              companyName: true,
            },
          },
          assignedTo: {
            select: {
              name: true,
            },
          },
          createdAt: true,
        },
        take: 20,
      });
    }

    const totalResults =
      results.clients.length + results.contracts.length + results.tasks.length;

    return success(res, {
      ...results,
      totalResults,
    });
  } catch (err: any) {
    console.error("globalSearch error:", err);
    return fail(res, "Failed to perform search", 500);
  }
}
