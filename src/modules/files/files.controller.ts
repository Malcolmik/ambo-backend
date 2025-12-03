import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthedRequest } from "../../middleware/auth";
import { success, fail } from "../../utils/response";
import { uploadToCloudinary, deleteFromCloudinary } from "../../services/cloudinary.service";
import multer from "multer";

// Configure multer for memory storage
const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allowed file types
    const allowedTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "text/plain",
      "application/zip",
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Allowed: images, PDF, Office docs, text, zip"));
    }
  },
});

/**
 * POST /api/files/upload
 * Upload a file to Cloudinary
 */
export async function uploadFile(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    if (!req.file) {
      return fail(res, "No file provided", 400);
    }

    const { entityType, entityId, description } = req.body;

    if (!entityType || !entityId) {
      return fail(res, "Entity type and ID are required", 400);
    }

    // Validate entity types
    const validEntityTypes = ["CONTRACT", "TASK", "QUESTIONNAIRE", "CLIENT", "USER"];
    if (!validEntityTypes.includes(entityType)) {
      return fail(res, "Invalid entity type", 400);
    }

    // Upload to Cloudinary
    const folder = `ambo/${entityType.toLowerCase()}/${entityId}`;
    const uploadResult = await uploadToCloudinary(req.file, folder);

    // Save file record to database
    const file = await prisma.file.create({
      data: {
        filename: req.file.originalname,
        fileUrl: uploadResult.url,
        fileType: req.file.mimetype,
        fileSize: uploadResult.size,
        cloudinaryPublicId: uploadResult.publicId,
        uploadedById: req.user.id,
        entityType,
        entityId,
        description: description || null,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        actionType: "FILE_UPLOADED",
        entityType,
        entityId,
        metaJson: {
          fileId: file.id,
          filename: file.filename,
          fileSize: file.fileSize,
        } as any,
      },
    });

    return success(res, {
      message: "File uploaded successfully",
      file,
    }, 201);
  } catch (err: any) {
    console.error("uploadFile error:", err);
    return fail(res, err.message || "Failed to upload file", 500);
  }
}

/**
 * GET /api/files/:entityType/:entityId
 * Get all files for a specific entity
 */
export async function getEntityFiles(req: AuthedRequest, res: Response) {
  try {
    const { entityType, entityId } = req.params;

    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    // Check authorization based on entity type
    let isAuthorized = false;

    if (req.user.role === "SUPER_ADMIN") {
      isAuthorized = true;
    } else if (entityType === "TASK") {
      // Check if user is assigned to the task or is the client
      const task = await prisma.task.findUnique({
        where: { id: entityId },
        include: { client: true },
      });

      if (task) {
        if (task.assignedToId === req.user.id) {
          isAuthorized = true;
        } else if (req.user.role === "CLIENT_VIEWER") {
          const client = await prisma.client.findFirst({
            where: { linkedUserId: req.user.id },
          });
          if (client && task.clientId === client.id) {
            isAuthorized = true;
          }
        }
      }
    } else if (entityType === "CONTRACT") {
      // Check if user is the contract owner
      const contract = await prisma.contract.findUnique({
        where: { id: entityId },
        include: { client: true },
      });

      if (contract && req.user.role === "CLIENT_VIEWER") {
        const client = await prisma.client.findFirst({
          where: { linkedUserId: req.user.id },
        });
        if (client && contract.clientId === client.id) {
          isAuthorized = true;
        }
      }
    }

    if (!isAuthorized) {
      return fail(res, "Forbidden", 403);
    }

    const files = await prisma.file.findMany({
      where: {
        entityType,
        entityId,
      },
      include: {
        uploadedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return success(res, {
      files,
      count: files.length,
    });
  } catch (err: any) {
    console.error("getEntityFiles error:", err);
    return fail(res, "Failed to retrieve files", 500);
  }
}

/**
 * GET /api/files/:id
 * Get a specific file
 */
export async function getFile(req: AuthedRequest, res: Response) {
  try {
    const { id } = req.params;

    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    const file = await prisma.file.findUnique({
      where: { id },
      include: {
        uploadedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!file) {
      return fail(res, "File not found", 404);
    }

    // Check authorization
    let isAuthorized = false;

    if (req.user.role === "SUPER_ADMIN" || file.uploadedById === req.user.id) {
      isAuthorized = true;
    } else {
      // Check entity-based authorization
      if (file.entityType === "TASK") {
        const task = await prisma.task.findUnique({
          where: { id: file.entityId },
        });
        if (task && task.assignedToId === req.user.id) {
          isAuthorized = true;
        }
      } else if (file.entityType === "CONTRACT") {
        const contract = await prisma.contract.findUnique({
          where: { id: file.entityId },
          include: { client: true },
        });
        if (contract) {
          const client = await prisma.client.findFirst({
            where: { linkedUserId: req.user.id },
          });
          if (client && contract.clientId === client.id) {
            isAuthorized = true;
          }
        }
      }
    }

    if (!isAuthorized) {
      return fail(res, "Forbidden", 403);
    }

    return success(res, { file });
  } catch (err: any) {
    console.error("getFile error:", err);
    return fail(res, "Failed to retrieve file", 500);
  }
}

/**
 * DELETE /api/files/:id
 * Delete a file
 */
export async function deleteFile(req: AuthedRequest, res: Response) {
  try {
    const { id } = req.params;

    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    const file = await prisma.file.findUnique({
      where: { id },
    });

    if (!file) {
      return fail(res, "File not found", 404);
    }

    // Only uploader or super admin can delete
    if (req.user.role !== "SUPER_ADMIN" && file.uploadedById !== req.user.id) {
      return fail(res, "Forbidden: Only the uploader or admin can delete this file", 403);
    }

    // Delete from Cloudinary
    if (file.cloudinaryPublicId) {
      try {
        await deleteFromCloudinary(file.cloudinaryPublicId);
      } catch (cloudinaryError) {
        console.error("Error deleting from Cloudinary:", cloudinaryError);
        // Continue with database deletion even if Cloudinary fails
      }
    }

    // Delete from database
    await prisma.file.delete({
      where: { id },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        actionType: "FILE_DELETED",
        entityType: file.entityType,
        entityId: file.entityId,
        metaJson: {
          fileId: file.id,
          filename: file.filename,
        } as any,
      },
    });

    return success(res, { message: "File deleted successfully" });
  } catch (err: any) {
    console.error("deleteFile error:", err);
    return fail(res, "Failed to delete file", 500);
  }
}
