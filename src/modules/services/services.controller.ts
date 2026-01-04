import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthedRequest } from "../../middleware/auth";
import { success, fail } from "../../utils/response";

/**
 * GET /api/services
 * Get all active services (Public - for client packages page)
 */
export async function getActiveServices(req: AuthedRequest, res: Response) {
  try {
    const services = await prisma.service.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    });

    const transformed = services.map((svc) => ({
      id: svc.id,
      name: svc.name,
      description: svc.description,
      price: Number(svc.price),
      currency: svc.currency,
      sortOrder: svc.sortOrder,
    }));

    return success(res, transformed);
  } catch (err: any) {
    console.error("getActiveServices error:", err);
    return fail(res, "Failed to fetch services", 500);
  }
}

/**
 * GET /api/services/all
 * Get all services including inactive (SUPER_ADMIN only)
 */
export async function getAllServices(req: AuthedRequest, res: Response) {
  try {
    const services = await prisma.service.findMany({
      include: {
        packages: {
          include: {
            package: {
              select: {
                id: true,
                name: true,
                displayName: true,
              },
            },
          },
        },
      },
      orderBy: { sortOrder: "asc" },
    });

    const transformed = services.map((svc) => ({
      id: svc.id,
      name: svc.name,
      description: svc.description,
      price: Number(svc.price),
      currency: svc.currency,
      isActive: svc.isActive,
      sortOrder: svc.sortOrder,
      usedInPackages: svc.packages.map((ps) => ({
        id: ps.package.id,
        name: ps.package.displayName,
      })),
      createdAt: svc.createdAt,
      updatedAt: svc.updatedAt,
    }));

    return success(res, transformed);
  } catch (err: any) {
    console.error("getAllServices error:", err);
    return fail(res, "Failed to fetch services", 500);
  }
}

/**
 * GET /api/services/:id
 * Get single service details
 */
export async function getService(req: AuthedRequest, res: Response) {
  try {
    const { id } = req.params;

    const service = await prisma.service.findUnique({
      where: { id },
      include: {
        packages: {
          include: {
            package: {
              select: {
                id: true,
                name: true,
                displayName: true,
              },
            },
          },
        },
      },
    });

    if (!service) {
      return fail(res, "Service not found", 404);
    }

    const transformed = {
      id: service.id,
      name: service.name,
      description: service.description,
      price: Number(service.price),
      currency: service.currency,
      isActive: service.isActive,
      sortOrder: service.sortOrder,
      usedInPackages: service.packages.map((ps) => ({
        id: ps.package.id,
        name: ps.package.displayName,
      })),
      createdAt: service.createdAt,
      updatedAt: service.updatedAt,
    };

    return success(res, transformed);
  } catch (err: any) {
    console.error("getService error:", err);
    return fail(res, "Failed to fetch service", 500);
  }
}

/**
 * POST /api/services
 * Create new service (SUPER_ADMIN only)
 */
export async function createService(req: AuthedRequest, res: Response) {
  try {
    const {
      name,
      description,
      price,
      isActive = true,
      sortOrder = 0,
    } = req.body;

    // Validation
    if (!name || price === undefined) {
      return fail(res, "Name and price are required", 400);
    }

    // Create service
    const service = await prisma.service.create({
      data: {
        name,
        description,
        price: Number(price),
        currency: "USD",
        isActive,
        sortOrder,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        actionType: "SERVICE_CREATED",
        entityType: "SERVICE",
        entityId: service.id,
        metaJson: { name, price } as any,
      },
    });

    return success(res, {
      ...service,
      price: Number(service.price),
    }, 201);
  } catch (err: any) {
    console.error("createService error:", err);
    return fail(res, "Failed to create service", 500);
  }
}

/**
 * PATCH /api/services/:id
 * Update service (SUPER_ADMIN only)
 */
export async function updateService(req: AuthedRequest, res: Response) {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      price,
      isActive,
      sortOrder,
    } = req.body;

    // Check if service exists
    const existing = await prisma.service.findUnique({
      where: { id },
    });

    if (!existing) {
      return fail(res, "Service not found", 404);
    }

    // Update service
    const service = await prisma.service.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(price !== undefined && { price: Number(price) }),
        ...(isActive !== undefined && { isActive }),
        ...(sortOrder !== undefined && { sortOrder }),
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        actionType: "SERVICE_UPDATED",
        entityType: "SERVICE",
        entityId: id,
        metaJson: req.body as any,
      },
    });

    return success(res, {
      ...service,
      price: Number(service.price),
    });
  } catch (err: any) {
    console.error("updateService error:", err);
    return fail(res, "Failed to update service", 500);
  }
}

/**
 * DELETE /api/services/:id
 * Soft delete service (set inactive) (SUPER_ADMIN only)
 */
export async function deleteService(req: AuthedRequest, res: Response) {
  try {
    const { id } = req.params;

    const existing = await prisma.service.findUnique({
      where: { id },
      include: {
        packages: true,
      },
    });

    if (!existing) {
      return fail(res, "Service not found", 404);
    }

    // Check if service is used in any active packages
    if (existing.packages.length > 0) {
      // Just deactivate, don't remove from packages
      await prisma.service.update({
        where: { id },
        data: { isActive: false },
      });

      return success(res, { 
        message: "Service deactivated. Note: It is still linked to packages.",
        linkedPackages: existing.packages.length,
      });
    }

    // Soft delete - set inactive
    await prisma.service.update({
      where: { id },
      data: { isActive: false },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        actionType: "SERVICE_DELETED",
        entityType: "SERVICE",
        entityId: id,
        metaJson: { name: existing.name } as any,
      },
    });

    return success(res, { message: "Service deactivated successfully" });
  } catch (err: any) {
    console.error("deleteService error:", err);
    return fail(res, "Failed to delete service", 500);
  }
}
