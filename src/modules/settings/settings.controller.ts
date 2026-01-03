import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthedRequest } from "../../middleware/auth";
import { success, fail } from "../../utils/response";
import { hashPassword } from "../../utils/hash";

// ============================================
// PLATFORM SETTINGS (Support Channels)
// ============================================

/**
 * GET /api/settings/support
 * Get support channel information (public to authenticated users)
 * ALL authenticated users
 */
export async function getSupportChannels(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    let settings = await prisma.platformSettings.findUnique({
      where: { id: "default" },
    });

    // Create default settings if not exist
    if (!settings) {
      settings = await prisma.platformSettings.create({
        data: {
          id: "default",
          supportWhatsapp: null,
          supportEmail: null,
          supportInstagram: null,
          supportPhone: null,
        },
      });
    }

    return success(res, {
      whatsapp: settings.supportWhatsapp,
      email: settings.supportEmail,
      instagram: settings.supportInstagram,
      phone: settings.supportPhone,
    });
  } catch (err: any) {
    console.error("getSupportChannels error:", err);
    return fail(res, "Failed to get support channels", 500);
  }
}

/**
 * GET /api/settings
 * Get all platform settings
 * SUPER_ADMIN only
 */
export async function getPlatformSettings(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    if (req.user.role !== "SUPER_ADMIN") {
      return fail(res, "Forbidden: Only super admins can view platform settings", 403);
    }

    let settings = await prisma.platformSettings.findUnique({
      where: { id: "default" },
    });

    if (!settings) {
      settings = await prisma.platformSettings.create({
        data: { id: "default" },
      });
    }

    return success(res, settings);
  } catch (err: any) {
    console.error("getPlatformSettings error:", err);
    return fail(res, "Failed to get platform settings", 500);
  }
}

/**
 * PATCH /api/settings
 * Update platform settings (support channels + legal documents)
 * SUPER_ADMIN only
 * V3: Now also supports termsAndConditions and privacyPolicy
 */
export async function updatePlatformSettings(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    if (req.user.role !== "SUPER_ADMIN") {
      return fail(res, "Forbidden: Only super admins can update platform settings", 403);
    }

    const { 
      supportWhatsapp, 
      supportEmail, 
      supportInstagram, 
      supportPhone,
      // V3: Legal documents
      termsAndConditions,
      privacyPolicy,
    } = req.body;

    // Build update data
    const updateData: any = {};
    
    // Support channels (original)
    if (supportWhatsapp !== undefined) updateData.supportWhatsapp = supportWhatsapp;
    if (supportEmail !== undefined) updateData.supportEmail = supportEmail;
    if (supportInstagram !== undefined) updateData.supportInstagram = supportInstagram;
    if (supportPhone !== undefined) updateData.supportPhone = supportPhone;

    // V3: Legal documents with timestamps
    if (termsAndConditions !== undefined) {
      updateData.termsAndConditions = termsAndConditions;
      updateData.termsUpdatedAt = new Date();
    }
    if (privacyPolicy !== undefined) {
      updateData.privacyPolicy = privacyPolicy;
      updateData.privacyUpdatedAt = new Date();
    }

    const settings = await prisma.platformSettings.upsert({
      where: { id: "default" },
      update: updateData,
      create: {
        id: "default",
        supportWhatsapp,
        supportEmail,
        supportInstagram,
        supportPhone,
        ...updateData,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        actionType: "PLATFORM_SETTINGS_UPDATED",
        entityType: "SETTINGS",
        entityId: "default",
        metaJson: {
          supportWhatsapp,
          supportEmail,
          supportInstagram,
          supportPhone,
        },
      },
    });

    return success(res, {
      message: "Platform settings updated",
      settings,
    });
  } catch (err: any) {
    console.error("updatePlatformSettings error:", err);
    return fail(res, "Failed to update platform settings", 500);
  }
}

// ============================================
// V3: LEGAL DOCUMENTS (NEW)
// ============================================

/**
 * GET /api/settings/legal
 * Get both terms and privacy policy (Public - no auth required)
 */
export async function getLegalDocuments(req: AuthedRequest, res: Response) {
  try {
    const settings = await prisma.platformSettings.findUnique({
      where: { id: "default" },
      select: {
        termsAndConditions: true,
        privacyPolicy: true,
        termsUpdatedAt: true,
        privacyUpdatedAt: true,
      },
    });

    if (!settings) {
      return success(res, {
        termsAndConditions: null,
        privacyPolicy: null,
        termsUpdatedAt: null,
        privacyUpdatedAt: null,
      });
    }

    return success(res, settings);
  } catch (err: any) {
    console.error("getLegalDocuments error:", err);
    return fail(res, "Failed to fetch legal documents", 500);
  }
}

/**
 * GET /api/settings/terms
 * Get terms and conditions only (Public - no auth required)
 */
export async function getTermsAndConditions(req: AuthedRequest, res: Response) {
  try {
    const settings = await prisma.platformSettings.findUnique({
      where: { id: "default" },
      select: {
        termsAndConditions: true,
        termsUpdatedAt: true,
      },
    });

    return success(res, {
      content: settings?.termsAndConditions || null,
      updatedAt: settings?.termsUpdatedAt || null,
    });
  } catch (err: any) {
    console.error("getTermsAndConditions error:", err);
    return fail(res, "Failed to fetch terms and conditions", 500);
  }
}

/**
 * GET /api/settings/privacy
 * Get privacy policy only (Public - no auth required)
 */
export async function getPrivacyPolicy(req: AuthedRequest, res: Response) {
  try {
    const settings = await prisma.platformSettings.findUnique({
      where: { id: "default" },
      select: {
        privacyPolicy: true,
        privacyUpdatedAt: true,
      },
    });

    return success(res, {
      content: settings?.privacyPolicy || null,
      updatedAt: settings?.privacyUpdatedAt || null,
    });
  } catch (err: any) {
    console.error("getPrivacyPolicy error:", err);
    return fail(res, "Failed to fetch privacy policy", 500);
  }
}

/**
 * PATCH /api/settings/terms
 * Update terms and conditions (SUPER_ADMIN only)
 */
export async function updateTermsAndConditions(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    if (req.user.role !== "SUPER_ADMIN") {
      return fail(res, "Forbidden: Only super admins can update terms", 403);
    }

    const { content } = req.body;

    if (content === undefined) {
      return fail(res, "Content is required", 400);
    }

    const settings = await prisma.platformSettings.upsert({
      where: { id: "default" },
      update: {
        termsAndConditions: content,
        termsUpdatedAt: new Date(),
      },
      create: {
        id: "default",
        termsAndConditions: content,
        termsUpdatedAt: new Date(),
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        actionType: "TERMS_UPDATED",
        entityType: "PLATFORM_SETTINGS",
        entityId: "default",
        metaJson: {
          contentLength: content?.length || 0,
        } as any,
      },
    });

    return success(res, {
      message: "Terms and conditions updated successfully",
      updatedAt: settings.termsUpdatedAt,
    });
  } catch (err: any) {
    console.error("updateTermsAndConditions error:", err);
    return fail(res, "Failed to update terms and conditions", 500);
  }
}

/**
 * PATCH /api/settings/privacy
 * Update privacy policy (SUPER_ADMIN only)
 */
export async function updatePrivacyPolicy(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    if (req.user.role !== "SUPER_ADMIN") {
      return fail(res, "Forbidden: Only super admins can update privacy policy", 403);
    }

    const { content } = req.body;

    if (content === undefined) {
      return fail(res, "Content is required", 400);
    }

    const settings = await prisma.platformSettings.upsert({
      where: { id: "default" },
      update: {
        privacyPolicy: content,
        privacyUpdatedAt: new Date(),
      },
      create: {
        id: "default",
        privacyPolicy: content,
        privacyUpdatedAt: new Date(),
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        actionType: "PRIVACY_POLICY_UPDATED",
        entityType: "PLATFORM_SETTINGS",
        entityId: "default",
        metaJson: {
          contentLength: content?.length || 0,
        } as any,
      },
    });

    return success(res, {
      message: "Privacy policy updated successfully",
      updatedAt: settings.privacyUpdatedAt,
    });
  } catch (err: any) {
    console.error("updatePrivacyPolicy error:", err);
    return fail(res, "Failed to update privacy policy", 500);
  }
}

// ============================================
// ADMIN USER MANAGEMENT
// ============================================

/**
 * POST /api/settings/create-admin
 * Create a new ADMIN user
 * SUPER_ADMIN only
 */
export async function createAdmin(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    if (req.user.role !== "SUPER_ADMIN") {
      return fail(res, "Forbidden: Only super admins can create admin users", 403);
    }

    const { name, email, phone, password } = req.body;

    if (!name || !email || !password) {
      return fail(res, "Name, email, and password are required", 400);
    }

    if (password.length < 6) {
      return fail(res, "Password must be at least 6 characters", 400);
    }

    // Check if email exists
    const existing = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existing) {
      return fail(res, "A user with this email already exists", 409);
    }

    const passwordHash = await hashPassword(password);

    const admin = await prisma.user.create({
      data: {
        name,
        email: email.toLowerCase(),
        phone: phone || null,
        passwordHash,
        role: "ADMIN",
        active: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        active: true,
        createdAt: true,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        actionType: "ADMIN_CREATED",
        entityType: "USER",
        entityId: admin.id,
        metaJson: {
          adminEmail: admin.email,
          adminName: admin.name,
          createdBy: req.user.email,
        },
      },
    });

    return success(res, {
      message: "Admin user created successfully",
      admin,
    }, 201);
  } catch (err: any) {
    console.error("createAdmin error:", err);
    return fail(res, "Failed to create admin user", 500);
  }
}

/**
 * GET /api/settings/admins
 * Get all admin users
 * SUPER_ADMIN only
 */
export async function getAdmins(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    if (req.user.role !== "SUPER_ADMIN") {
      return fail(res, "Forbidden: Only super admins can view admin users", 403);
    }

    const admins = await prisma.user.findMany({
      where: { role: "ADMIN" },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        active: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return success(res, {
      admins,
      count: admins.length,
    });
  } catch (err: any) {
    console.error("getAdmins error:", err);
    return fail(res, "Failed to get admin users", 500);
  }
}

/**
 * PATCH /api/settings/admins/:id
 * Update an admin user
 * SUPER_ADMIN only
 */
export async function updateAdmin(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    if (req.user.role !== "SUPER_ADMIN") {
      return fail(res, "Forbidden: Only super admins can update admin users", 403);
    }

    const { id } = req.params;
    const { name, phone, active } = req.body;

    const admin = await prisma.user.findUnique({
      where: { id },
    });

    if (!admin) {
      return fail(res, "Admin not found", 404);
    }

    if (admin.role !== "ADMIN") {
      return fail(res, "User is not an admin", 400);
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        name: name ?? admin.name,
        phone: phone ?? admin.phone,
        active: active ?? admin.active,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        active: true,
        updatedAt: true,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        actionType: "ADMIN_UPDATED",
        entityType: "USER",
        entityId: id,
        metaJson: {
          changes: { name, phone, active },
        },
      },
    });

    return success(res, {
      message: "Admin user updated",
      admin: updated,
    });
  } catch (err: any) {
    console.error("updateAdmin error:", err);
    return fail(res, "Failed to update admin user", 500);
  }
}

/**
 * DELETE /api/settings/admins/:id
 * Deactivate an admin user (soft delete)
 * SUPER_ADMIN only
 */
export async function deactivateAdmin(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    if (req.user.role !== "SUPER_ADMIN") {
      return fail(res, "Forbidden: Only super admins can deactivate admin users", 403);
    }

    const { id } = req.params;

    const admin = await prisma.user.findUnique({
      where: { id },
    });

    if (!admin) {
      return fail(res, "Admin not found", 404);
    }

    if (admin.role !== "ADMIN") {
      return fail(res, "User is not an admin", 400);
    }

    await prisma.user.update({
      where: { id },
      data: { active: false },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        actionType: "ADMIN_DEACTIVATED",
        entityType: "USER",
        entityId: id,
        metaJson: {
          adminEmail: admin.email,
          adminName: admin.name,
        },
      },
    });

    return success(res, { message: "Admin user deactivated" });
  } catch (err: any) {
    console.error("deactivateAdmin error:", err);
    return fail(res, "Failed to deactivate admin user", 500);
  }
}

// ============================================
// WORKER MANAGEMENT (ADMIN + SUPER_ADMIN)
// ============================================

/**
 * GET /api/settings/workers
 * Get all workers
 * ADMIN, SUPER_ADMIN
 */
export async function getWorkers(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    if (!["ADMIN", "SUPER_ADMIN"].includes(req.user.role)) {
      return fail(res, "Forbidden", 403);
    }

    const workers = await prisma.user.findMany({
      where: { role: "WORKER" },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        active: true,
        createdAt: true,
        _count: {
          select: {
            tasksAssigned: true,
            jobApplications: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return success(res, {
      workers: workers.map((w) => ({
        id: w.id,
        name: w.name,
        email: w.email,
        phone: w.phone,
        active: w.active,
        createdAt: w.createdAt,
        totalTasks: w._count.tasksAssigned,
        totalApplications: w._count.jobApplications,
      })),
      count: workers.length,
    });
  } catch (err: any) {
    console.error("getWorkers error:", err);
    return fail(res, "Failed to get workers", 500);
  }
}

/**
 * POST /api/settings/workers
 * Create a new worker
 * ADMIN, SUPER_ADMIN
 */
export async function createWorker(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    if (!["ADMIN", "SUPER_ADMIN"].includes(req.user.role)) {
      return fail(res, "Forbidden", 403);
    }

    const { name, email, phone, password } = req.body;

    if (!name || !email || !password) {
      return fail(res, "Name, email, and password are required", 400);
    }

    if (password.length < 6) {
      return fail(res, "Password must be at least 6 characters", 400);
    }

    // Check if email exists
    const existing = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existing) {
      return fail(res, "A user with this email already exists", 409);
    }

    const passwordHash = await hashPassword(password);

    const worker = await prisma.user.create({
      data: {
        name,
        email: email.toLowerCase(),
        phone: phone || null,
        passwordHash,
        role: "WORKER",
        active: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        active: true,
        createdAt: true,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        actionType: "WORKER_CREATED",
        entityType: "USER",
        entityId: worker.id,
        metaJson: {
          workerEmail: worker.email,
          workerName: worker.name,
          createdBy: req.user.email,
          createdByRole: req.user.role,
        },
      },
    });

    return success(res, {
      message: "Worker created successfully",
      worker,
    }, 201);
  } catch (err: any) {
    console.error("createWorker error:", err);
    return fail(res, "Failed to create worker", 500);
  }
}

/**
 * GET /api/settings/workers/:id
 * Get a specific worker with stats
 * ADMIN, SUPER_ADMIN
 */
export async function getWorker(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    if (!["ADMIN", "SUPER_ADMIN"].includes(req.user.role)) {
      return fail(res, "Forbidden", 403);
    }

    const { id } = req.params;

    const worker = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        active: true,
        createdAt: true,
        updatedAt: true,
        tasksAssigned: {
          select: {
            id: true,
            title: true,
            status: true,
            paymentAmount: true,
            workerPaymentStatus: true,
            client: {
              select: {
                companyName: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 10,
        },
        jobApplications: {
          where: { status: "PENDING" },
          select: {
            id: true,
            status: true,
            task: {
              select: {
                title: true,
              },
            },
          },
        },
        _count: {
          select: {
            tasksAssigned: true,
            jobApplications: true,
          },
        },
      },
    });

    if (!worker) {
      return fail(res, "Worker not found", 404);
    }

    if (worker.role !== "WORKER") {
      return fail(res, "User is not a worker", 400);
    }

    // Calculate stats
    const completedTasks = worker.tasksAssigned.filter((t) => t.status === "DONE").length;
    const totalEarned = worker.tasksAssigned
      .filter((t) => t.status === "DONE")
      .reduce((sum, t) => sum + (t.paymentAmount ? Number(t.paymentAmount) : 0), 0);

    return success(res, {
      worker: {
        id: worker.id,
        name: worker.name,
        email: worker.email,
        phone: worker.phone,
        active: worker.active,
        createdAt: worker.createdAt,
        stats: {
          totalTasks: worker._count.tasksAssigned,
          completedTasks,
          totalEarned,
          pendingApplications: worker.jobApplications.length,
        },
        recentTasks: worker.tasksAssigned.map((t) => ({
          ...t,
          paymentAmount: t.paymentAmount ? Number(t.paymentAmount) : null,
        })),
      },
    });
  } catch (err: any) {
    console.error("getWorker error:", err);
    return fail(res, "Failed to get worker", 500);
  }
}

/**
 * PATCH /api/settings/workers/:id
 * Update a worker
 * ADMIN, SUPER_ADMIN
 */
export async function updateWorker(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    if (!["ADMIN", "SUPER_ADMIN"].includes(req.user.role)) {
      return fail(res, "Forbidden", 403);
    }

    const { id } = req.params;
    const { name, phone, active } = req.body;

    const worker = await prisma.user.findUnique({
      where: { id },
    });

    if (!worker) {
      return fail(res, "Worker not found", 404);
    }

    if (worker.role !== "WORKER") {
      return fail(res, "User is not a worker", 400);
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        name: name ?? worker.name,
        phone: phone ?? worker.phone,
        active: active ?? worker.active,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        active: true,
        updatedAt: true,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        actionType: "WORKER_UPDATED",
        entityType: "USER",
        entityId: id,
        metaJson: {
          changes: { name, phone, active },
          updatedBy: req.user.email,
          updatedByRole: req.user.role,
        },
      },
    });

    return success(res, {
      message: "Worker updated",
      worker: updated,
    });
  } catch (err: any) {
    console.error("updateWorker error:", err);
    return fail(res, "Failed to update worker", 500);
  }
}

/**
 * DELETE /api/settings/workers/:id
 * Deactivate a worker (soft delete)
 * ADMIN, SUPER_ADMIN
 */
export async function deactivateWorker(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    if (!["ADMIN", "SUPER_ADMIN"].includes(req.user.role)) {
      return fail(res, "Forbidden", 403);
    }

    const { id } = req.params;

    const worker = await prisma.user.findUnique({
      where: { id },
    });

    if (!worker) {
      return fail(res, "Worker not found", 404);
    }

    if (worker.role !== "WORKER") {
      return fail(res, "User is not a worker", 400);
    }

    await prisma.user.update({
      where: { id },
      data: { active: false },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        actionType: "WORKER_DEACTIVATED",
        entityType: "USER",
        entityId: id,
        metaJson: {
          workerEmail: worker.email,
          workerName: worker.name,
          deactivatedBy: req.user.email,
          deactivatedByRole: req.user.role,
        },
      },
    });

    return success(res, { message: "Worker deactivated" });
  } catch (err: any) {
    console.error("deactivateWorker error:", err);
    return fail(res, "Failed to deactivate worker", 500);
  }
}

// ============================================
// CHAT STEP-IN (ADMIN)
// ============================================

/**
 * POST /api/settings/chats/:channelId/join
 * Admin joins an existing chat channel
 * ADMIN, SUPER_ADMIN
 */
export async function adminJoinChat(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    if (!["ADMIN", "SUPER_ADMIN"].includes(req.user.role)) {
      return fail(res, "Forbidden", 403);
    }

    const { channelId } = req.params;

    const channel = await prisma.chatChannel.findUnique({
      where: { id: channelId },
      include: {
        client: { select: { companyName: true } },
        worker: { select: { name: true } },
      },
    });

    if (!channel) {
      return fail(res, "Chat channel not found", 404);
    }

    // Audit log for stepping into chat
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        actionType: "ADMIN_JOINED_CHAT",
        entityType: "CHAT",
        entityId: channelId,
        metaJson: {
          adminId: req.user.id,
          adminName: req.user.name,
          adminRole: req.user.role,
          clientName: channel.client?.companyName,
          workerName: channel.worker?.name,
        },
      },
    });

    // Notify SUPER_ADMINs if an ADMIN stepped in (not if SUPER_ADMIN themselves)
    if (req.user.role === "ADMIN") {
      const superAdmins = await prisma.user.findMany({
        where: { role: "SUPER_ADMIN", active: true },
        select: { id: true },
      });

      for (const superAdmin of superAdmins) {
        await prisma.notification.create({
          data: {
            userId: superAdmin.id,
            type: "ADMIN_JOINED_CHAT",
            title: "Admin Joined Chat",
            body: `${req.user.name} (Admin) joined the chat between ${channel.client?.companyName || "client"} and ${channel.worker?.name || "support"}.`,
          },
        });
      }
    }

    return success(res, {
      message: "Successfully joined chat",
      channel: {
        id: channel.id,
        clientName: channel.client?.companyName,
        workerName: channel.worker?.name,
      },
    });
  } catch (err: any) {
    console.error("adminJoinChat error:", err);
    return fail(res, "Failed to join chat", 500);
  }
}

/**
 * GET /api/settings/chats
 * Get all chat channels (for admin oversight)
 * ADMIN, SUPER_ADMIN
 */
export async function getAllChats(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    if (!["ADMIN", "SUPER_ADMIN"].includes(req.user.role)) {
      return fail(res, "Forbidden", 403);
    }

    const channels = await prisma.chatChannel.findMany({
      include: {
        client: {
          select: {
            id: true,
            companyName: true,
            logoUrl: true,
          },
        },
        worker: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            content: true,
            createdAt: true,
            sender: {
              select: { name: true },
            },
          },
        },
        _count: {
          select: {
            messages: true,
          },
        },
      },
      orderBy: { lastMessageAt: "desc" },
    });

    const chats = channels.map((ch) => ({
      id: ch.id,
      client: ch.client,
      worker: ch.worker,
      lastMessage: ch.messages[0] || null,
      messageCount: ch._count.messages,
      lastMessageAt: ch.lastMessageAt,
      createdAt: ch.createdAt,
    }));

    return success(res, {
      chats,
      count: chats.length,
    });
  } catch (err: any) {
    console.error("getAllChats error:", err);
    return fail(res, "Failed to get chats", 500);
  }
}
