import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthedRequest } from "../../middleware/auth";
import { success, fail } from "../../utils/response";

/**
 * GET /api/packages
 * Get all active packages (Public - for client packages page)
 */
export async function getActivePackages(req: AuthedRequest, res: Response) {
  try {
    const packages = await prisma.package.findMany({
      where: { isActive: true },
      include: {
        services: {
          include: {
            service: {
              select: {
                id: true,
                name: true,
                description: true,
                price: true,
              },
            },
          },
        },
      },
      orderBy: { sortOrder: "asc" },
    });

    // Transform to include service names as features
    const transformed = packages.map((pkg) => ({
      id: pkg.id,
      name: pkg.name,
      displayName: pkg.displayName,
      description: pkg.description,
      price: Number(pkg.price),
      currency: pkg.currency,
      sortOrder: pkg.sortOrder,
      // Combine service names with custom features
      features: [
        ...pkg.services.map((ps) => ps.service.name),
        ...((pkg.customFeatures as string[]) || []),
      ],
      includedServices: pkg.services.map((ps) => ({
        id: ps.service.id,
        name: ps.service.name,
        description: ps.service.description,
        price: Number(ps.service.price),
      })),
      customFeatures: pkg.customFeatures || [],
    }));

    return success(res, transformed);
  } catch (err: any) {
    console.error("getActivePackages error:", err);
    return fail(res, "Failed to fetch packages", 500);
  }
}

/**
 * GET /api/packages/all
 * Get all packages including inactive (SUPER_ADMIN only)
 */
export async function getAllPackages(req: AuthedRequest, res: Response) {
  try {
    const packages = await prisma.package.findMany({
      include: {
        services: {
          include: {
            service: {
              select: {
                id: true,
                name: true,
                description: true,
                price: true,
              },
            },
          },
        },
      },
      orderBy: { sortOrder: "asc" },
    });

    const transformed = packages.map((pkg) => ({
      id: pkg.id,
      name: pkg.name,
      displayName: pkg.displayName,
      description: pkg.description,
      price: Number(pkg.price),
      currency: pkg.currency,
      isActive: pkg.isActive,
      sortOrder: pkg.sortOrder,
      features: [
        ...pkg.services.map((ps) => ps.service.name),
        ...((pkg.customFeatures as string[]) || []),
      ],
      includedServices: pkg.services.map((ps) => ({
        id: ps.service.id,
        name: ps.service.name,
        price: Number(ps.service.price),
      })),
      customFeatures: pkg.customFeatures || [],
      createdAt: pkg.createdAt,
      updatedAt: pkg.updatedAt,
    }));

    return success(res, transformed);
  } catch (err: any) {
    console.error("getAllPackages error:", err);
    return fail(res, "Failed to fetch packages", 500);
  }
}

/**
 * GET /api/packages/:id
 * Get single package details
 */
export async function getPackage(req: AuthedRequest, res: Response) {
  try {
    const { id } = req.params;

    const pkg = await prisma.package.findUnique({
      where: { id },
      include: {
        services: {
          include: {
            service: true,
          },
        },
      },
    });

    if (!pkg) {
      return fail(res, "Package not found", 404);
    }

    const transformed = {
      id: pkg.id,
      name: pkg.name,
      displayName: pkg.displayName,
      description: pkg.description,
      price: Number(pkg.price),
      currency: pkg.currency,
      isActive: pkg.isActive,
      sortOrder: pkg.sortOrder,
      includedServices: pkg.services.map((ps) => ({
        id: ps.service.id,
        name: ps.service.name,
        description: ps.service.description,
        price: Number(ps.service.price),
      })),
      customFeatures: pkg.customFeatures || [],
      createdAt: pkg.createdAt,
      updatedAt: pkg.updatedAt,
    };

    return success(res, transformed);
  } catch (err: any) {
    console.error("getPackage error:", err);
    return fail(res, "Failed to fetch package", 500);
  }
}

/**
 * POST /api/packages
 * Create new package (SUPER_ADMIN only)
 */
export async function createPackage(req: AuthedRequest, res: Response) {
  try {
    const {
      name,
      displayName,
      description,
      price,
      isActive = true,
      sortOrder = 0,
      serviceIds = [],
      customFeatures = [],
    } = req.body;

    // Validation
    if (!name || !displayName || price === undefined) {
      return fail(res, "Name, displayName, and price are required", 400);
    }

    // Check for duplicate name
    const existing = await prisma.package.findUnique({
      where: { name: name.toUpperCase() },
    });

    if (existing) {
      return fail(res, "Package with this name already exists", 400);
    }

    // Create package with services in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create package
      const pkg = await tx.package.create({
        data: {
          name: name.toUpperCase(),
          displayName,
          description,
          price: Number(price),
          currency: "USD",
          isActive,
          sortOrder,
          customFeatures,
        },
      });

      // Link services if provided
      if (serviceIds.length > 0) {
        await tx.packageService.createMany({
          data: serviceIds.map((serviceId: string) => ({
            packageId: pkg.id,
            serviceId,
          })),
        });
      }

      return pkg;
    });

    // Fetch complete package with relations
    const pkg = await prisma.package.findUnique({
      where: { id: result.id },
      include: {
        services: {
          include: { service: true },
        },
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        actionType: "PACKAGE_CREATED",
        entityType: "PACKAGE",
        entityId: result.id,
        metaJson: { name: displayName, price } as any,
      },
    });

    return success(res, pkg, 201);
  } catch (err: any) {
    console.error("createPackage error:", err);
    return fail(res, "Failed to create package", 500);
  }
}

/**
 * PATCH /api/packages/:id
 * Update package (SUPER_ADMIN only)
 */
export async function updatePackage(req: AuthedRequest, res: Response) {
  try {
    const { id } = req.params;
    const {
      name,
      displayName,
      description,
      price,
      isActive,
      sortOrder,
      serviceIds,
      customFeatures,
    } = req.body;

    // Check if package exists
    const existing = await prisma.package.findUnique({
      where: { id },
    });

    if (!existing) {
      return fail(res, "Package not found", 404);
    }

    // Check for duplicate name if changing
    if (name && name.toUpperCase() !== existing.name) {
      const duplicate = await prisma.package.findUnique({
        where: { name: name.toUpperCase() },
      });
      if (duplicate) {
        return fail(res, "Package with this name already exists", 400);
      }
    }

    // Update in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update package
      const pkg = await tx.package.update({
        where: { id },
        data: {
          ...(name && { name: name.toUpperCase() }),
          ...(displayName && { displayName }),
          ...(description !== undefined && { description }),
          ...(price !== undefined && { price: Number(price) }),
          ...(isActive !== undefined && { isActive }),
          ...(sortOrder !== undefined && { sortOrder }),
          ...(customFeatures !== undefined && { customFeatures }),
        },
      });

      // Update services if provided
      if (serviceIds !== undefined) {
        // Remove existing links
        await tx.packageService.deleteMany({
          where: { packageId: id },
        });

        // Add new links
        if (serviceIds.length > 0) {
          await tx.packageService.createMany({
            data: serviceIds.map((serviceId: string) => ({
              packageId: id,
              serviceId,
            })),
          });
        }
      }

      return pkg;
    });

    // Fetch updated package with relations
    const pkg = await prisma.package.findUnique({
      where: { id },
      include: {
        services: {
          include: { service: true },
        },
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        actionType: "PACKAGE_UPDATED",
        entityType: "PACKAGE",
        entityId: id,
        metaJson: req.body as any,
      },
    });

    return success(res, pkg);
  } catch (err: any) {
    console.error("updatePackage error:", err);
    return fail(res, "Failed to update package", 500);
  }
}

/**
 * DELETE /api/packages/:id
 * Soft delete package (set inactive) (SUPER_ADMIN only)
 */
export async function deletePackage(req: AuthedRequest, res: Response) {
  try {
    const { id } = req.params;

    const existing = await prisma.package.findUnique({
      where: { id },
    });

    if (!existing) {
      return fail(res, "Package not found", 404);
    }

    // Soft delete - set inactive
    await prisma.package.update({
      where: { id },
      data: { isActive: false },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        actionType: "PACKAGE_DELETED",
        entityType: "PACKAGE",
        entityId: id,
        metaJson: { name: existing.displayName } as any,
      },
    });

    return success(res, { message: "Package deactivated successfully" });
  } catch (err: any) {
    console.error("deletePackage error:", err);
    return fail(res, "Failed to delete package", 500);
  }
}
