import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthedRequest } from "../../middleware/auth";
import { success, fail } from "../../utils/response";
import { Prisma } from "@prisma/client";

// ============================================
// WORKER ENDPOINTS
// ============================================

/**
 * GET /api/jobs/available
 * Get all available jobs (OPEN or REVIEWING status) for workers to apply
 * WORKER only
 */
export async function getAvailableJobs(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    if (req.user.role !== "WORKER") {
      return fail(res, "Forbidden: Only workers can view available jobs", 403);
    }

    const { sort = "newest", search } = req.query;

    // Build where clause
    const where: Prisma.TaskWhereInput = {
      isPublic: true,
      jobStatus: { in: ["OPEN", "REVIEWING"] },
    };

    // Add search filter if provided
    if (search && typeof search === "string") {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    // Build order by
    let orderBy: Prisma.TaskOrderByWithRelationInput = { postedAt: "desc" };
    if (sort === "deadline") {
      orderBy = { deadline: "asc" };
    } else if (sort === "payment") {
      orderBy = { paymentAmount: "desc" };
    }

    const jobs = await prisma.task.findMany({
      where,
      orderBy,
      include: {
        client: {
          select: {
            id: true,
            companyName: true,
            logoUrl: true,
          },
        },
        applications: {
          select: {
            id: true,
            workerId: true,
            status: true,
          },
        },
        _count: {
          select: {
            applications: {
              where: { status: { in: ["PENDING", "APPROVED"] } },
            },
          },
        },
      },
    });

    // Transform response to include worker's application status
    const transformedJobs = jobs.map((job) => {
      const myApplication = job.applications.find(
        (app) => app.workerId === req.user!.id
      );

      return {
        id: job.id,
        title: job.title,
        description: job.description,
        priority: job.priority,
        deadline: job.deadline,
        dueDate: job.dueDate,
        paymentAmount: job.paymentAmount ? Number(job.paymentAmount) : null,
        jobStatus: job.jobStatus,
        postedAt: job.postedAt,
        client: job.client
          ? {
              id: job.client.id,
              companyName: job.client.companyName,
              logoUrl: job.client.logoUrl,
            }
          : null,
        applicantCount: job._count.applications,
        myApplicationStatus: myApplication?.status || null,
        myApplicationId: myApplication?.id || null,
        hasApplied: !!myApplication,
      };
    });

    return success(res, {
      jobs: transformedJobs,
      count: transformedJobs.length,
    });
  } catch (err: any) {
    console.error("getAvailableJobs error:", err);
    return fail(res, "Failed to fetch available jobs", 500);
  }
}

/**
 * GET /api/jobs/:taskId
 * Get job details (for workers viewing a specific job)
 * WORKER, ADMIN, SUPER_ADMIN
 */
export async function getJobDetails(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    const { taskId } = req.params;

    const job = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        client: {
          select: {
            id: true,
            companyName: true,
            logoUrl: true,
            contactPerson: true,
          },
        },
        contract: {
          select: {
            id: true,
            packageType: true,
          },
        },
        applications: req.user.role === "WORKER"
          ? {
              where: { workerId: req.user.id },
              select: {
                id: true,
                status: true,
                coverNote: true,
                appliedAt: true,
              },
            }
          : {
              include: {
                worker: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
              },
              orderBy: { appliedAt: "asc" },
            },
        _count: {
          select: {
            applications: {
              where: { status: "PENDING" },
            },
          },
        },
      },
    });

    if (!job) {
      return fail(res, "Job not found", 404);
    }

    // Workers can only see public jobs or jobs they're assigned to
    if (req.user.role === "WORKER") {
      if (!job.isPublic && job.assignedToId !== req.user.id) {
        return fail(res, "Forbidden", 403);
      }
    }

    return success(res, {
      job: {
        ...job,
        paymentAmount: job.paymentAmount ? Number(job.paymentAmount) : null,
        pendingApplicationCount: job._count.applications,
      },
    });
  } catch (err: any) {
    console.error("getJobDetails error:", err);
    return fail(res, "Failed to fetch job details", 500);
  }
}

/**
 * POST /api/jobs/:taskId/apply
 * Worker applies for a job
 * WORKER only
 */
export async function applyForJob(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    if (req.user.role !== "WORKER") {
      return fail(res, "Forbidden: Only workers can apply for jobs", 403);
    }

    const { taskId } = req.params;
    const { coverNote } = req.body;

    // Find the job
    const job = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        applications: {
          where: { workerId: req.user.id },
        },
      },
    });

    if (!job) {
      return fail(res, "Job not found", 404);
    }

    // Check if job is available for applications
    if (!job.isPublic || !["OPEN", "REVIEWING"].includes(job.jobStatus)) {
      return fail(res, "This job is no longer accepting applications", 400);
    }

    // Check if already applied
    if (job.applications.length > 0) {
      return fail(res, "You have already applied for this job", 400);
    }

    // Create application and update job status in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create application
      const application = await tx.jobApplication.create({
        data: {
          taskId,
          workerId: req.user!.id,
          coverNote: coverNote?.trim() || null,
          status: "PENDING",
        },
      });

      // Update job status to REVIEWING if this is the first application
      if (job.jobStatus === "OPEN") {
        await tx.task.update({
          where: { id: taskId },
          data: { jobStatus: "REVIEWING" },
        });
      }

      // Notify admins about new application
      const admins = await tx.user.findMany({
        where: {
          role: { in: ["SUPER_ADMIN", "ADMIN"] },
          active: true,
        },
        select: { id: true },
      });

      for (const admin of admins) {
        await tx.notification.create({
          data: {
            userId: admin.id,
            type: "JOB_APPLICATION_RECEIVED",
            title: "New Job Application",
            body: `${req.user!.name} applied for "${job.title}"`,
          },
        });
      }

      // Audit log
      await tx.auditLog.create({
        data: {
          userId: req.user!.id,
          actionType: "JOB_APPLICATION_SUBMITTED",
          entityType: "TASK",
          entityId: taskId,
          metaJson: {
            applicationId: application.id,
            jobTitle: job.title,
          },
        },
      });

      return application;
    });

    return success(res, {
      message: "Application submitted successfully",
      application: result,
    }, 201);
  } catch (err: any) {
    console.error("applyForJob error:", err);
    if (err.code === "P2002") {
      return fail(res, "You have already applied for this job", 400);
    }
    return fail(res, "Failed to submit application", 500);
  }
}

/**
 * DELETE /api/jobs/:taskId/apply
 * Worker withdraws their application
 * WORKER only
 */
export async function withdrawApplication(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    if (req.user.role !== "WORKER") {
      return fail(res, "Forbidden: Only workers can withdraw applications", 403);
    }

    const { taskId } = req.params;

    // Find the application
    const application = await prisma.jobApplication.findUnique({
      where: {
        taskId_workerId: {
          taskId,
          workerId: req.user.id,
        },
      },
      include: {
        task: {
          select: { title: true },
        },
      },
    });

    if (!application) {
      return fail(res, "Application not found", 404);
    }

    // Can only withdraw PENDING applications
    if (application.status !== "PENDING") {
      return fail(res, `Cannot withdraw application with status: ${application.status}`, 400);
    }

    // Update application status
    await prisma.$transaction(async (tx) => {
      await tx.jobApplication.update({
        where: { id: application.id },
        data: { status: "WITHDRAWN" },
      });

      // Check if there are other pending applications
      const remainingApplications = await tx.jobApplication.count({
        where: {
          taskId,
          status: "PENDING",
          id: { not: application.id },
        },
      });

      // If no more pending applications, revert job to OPEN
      if (remainingApplications === 0) {
        await tx.task.update({
          where: { id: taskId },
          data: { jobStatus: "OPEN" },
        });
      }

      // Audit log
      await tx.auditLog.create({
        data: {
          userId: req.user!.id,
          actionType: "JOB_APPLICATION_WITHDRAWN",
          entityType: "TASK",
          entityId: taskId,
          metaJson: {
            applicationId: application.id,
            jobTitle: application.task.title,
          },
        },
      });
    });

    return success(res, { message: "Application withdrawn successfully" });
  } catch (err: any) {
    console.error("withdrawApplication error:", err);
    return fail(res, "Failed to withdraw application", 500);
  }
}

/**
 * GET /api/jobs/my-applications
 * Get all applications submitted by the worker
 * WORKER only
 */
export async function getMyApplications(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    if (req.user.role !== "WORKER") {
      return fail(res, "Forbidden: Only workers can view their applications", 403);
    }

    const { status } = req.query;

    const where: Prisma.JobApplicationWhereInput = {
      workerId: req.user.id,
    };

    if (status && typeof status === "string") {
      where.status = status as any;
    }

    const applications = await prisma.jobApplication.findMany({
      where,
      include: {
        task: {
          select: {
            id: true,
            title: true,
            description: true,
            priority: true,
            deadline: true,
            paymentAmount: true,
            jobStatus: true,
            client: {
              select: {
                id: true,
                companyName: true,
                logoUrl: true,
              },
            },
          },
        },
      },
      orderBy: { appliedAt: "desc" },
    });

    const transformedApplications = applications.map((app) => ({
      id: app.id,
      status: app.status,
      coverNote: app.coverNote,
      appliedAt: app.appliedAt,
      reviewedAt: app.reviewedAt,
      rejectionReason: app.rejectionReason,
      task: {
        id: app.task.id,
        title: app.task.title,
        description: app.task.description,
        priority: app.task.priority,
        deadline: app.task.deadline,
        paymentAmount: app.task.paymentAmount ? Number(app.task.paymentAmount) : null,
        jobStatus: app.task.jobStatus,
        client: app.task.client,
      },
    }));

    return success(res, {
      applications: transformedApplications,
      count: transformedApplications.length,
    });
  } catch (err: any) {
    console.error("getMyApplications error:", err);
    return fail(res, "Failed to fetch applications", 500);
  }
}

// ============================================
// ADMIN/SUPER_ADMIN ENDPOINTS
// ============================================

/**
 * POST /api/jobs/:taskId/broadcast
 * Push a task to the job board (make it available for applications)
 * ADMIN, SUPER_ADMIN only
 * UPDATED: Now sets postedById to track who broadcasted
 */
export async function pushToBroadcast(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    if (!["ADMIN", "SUPER_ADMIN"].includes(req.user.role)) {
      return fail(res, "Forbidden: Only admins can broadcast jobs", 403);
    }

    const { taskId } = req.params;
    const { paymentAmount, deadline } = req.body;

    // Validate payment amount
    if (paymentAmount === undefined || paymentAmount === null) {
      return fail(res, "Payment amount is required", 400);
    }

    const amount = Number(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      return fail(res, "Payment amount must be a positive number", 400);
    }

    // Find the task
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        client: { select: { companyName: true } },
      },
    });

    if (!task) {
      return fail(res, "Task not found", 404);
    }

    // Check if task can be broadcasted
    if (task.jobStatus !== "DRAFT") {
      return fail(res, `Cannot broadcast task with status: ${task.jobStatus}`, 400);
    }

    if (task.assignedToId) {
      return fail(res, "Cannot broadcast a task that is already assigned", 400);
    }

    // Update task to OPEN - NOW INCLUDES postedById
    const updatedTask = await prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id: taskId },
        data: {
          jobStatus: "OPEN",
          isPublic: true,
          paymentAmount: amount,
          deadline: deadline ? new Date(deadline) : null,
          postedAt: new Date(),
          postedById: req.user!.id,  // NEW: Track who broadcasted
        },
        include: {
          client: { select: { companyName: true } },
        },
      });

      // Notify all active workers about new job
      const workers = await tx.user.findMany({
        where: { role: "WORKER", active: true },
        select: { id: true },
      });

      for (const worker of workers) {
        await tx.notification.create({
          data: {
            userId: worker.id,
            type: "NEW_JOB_AVAILABLE",
            title: "New Job Available",
            body: `"${task.title}" is now available. Payment: ₦${amount.toLocaleString()}`,
          },
        });
      }

      // Audit log
      await tx.auditLog.create({
        data: {
          userId: req.user!.id,
          actionType: "JOB_BROADCASTED",
          entityType: "TASK",
          entityId: taskId,
          metaJson: {
            jobTitle: task.title,
            paymentAmount: amount,
            deadline: deadline || null,
            postedById: req.user!.id,
          },
        },
      });

      return updated;
    });

    return success(res, {
      message: "Job broadcasted successfully",
      task: {
        ...updatedTask,
        paymentAmount: updatedTask.paymentAmount ? Number(updatedTask.paymentAmount) : null,
      },
    });
  } catch (err: any) {
    console.error("pushToBroadcast error:", err);
    return fail(res, "Failed to broadcast job", 500);
  }
}

/**
 * GET /api/jobs/pending-review
 * Get all jobs with pending applications to review
 * ADMIN, SUPER_ADMIN only
 */
export async function getJobsWithPendingApplications(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    if (!["ADMIN", "SUPER_ADMIN"].includes(req.user.role)) {
      return fail(res, "Forbidden: Only admins can view pending applications", 403);
    }

    const jobs = await prisma.task.findMany({
      where: {
        jobStatus: "REVIEWING",
        applications: {
          some: { status: "PENDING" },
        },
      },
      include: {
        client: {
          select: {
            id: true,
            companyName: true,
            logoUrl: true,
          },
        },
        applications: {
          where: { status: "PENDING" },
          include: {
            worker: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
          orderBy: { appliedAt: "asc" },
        },
        _count: {
          select: {
            applications: { where: { status: "PENDING" } },
          },
        },
      },
      orderBy: { postedAt: "desc" },
    });

    const transformedJobs = jobs.map((job) => ({
      id: job.id,
      title: job.title,
      description: job.description,
      priority: job.priority,
      paymentAmount: job.paymentAmount ? Number(job.paymentAmount) : null,
      deadline: job.deadline,
      postedAt: job.postedAt,
      client: job.client,
      pendingApplicationCount: job._count.applications,
      applications: job.applications.map((app) => ({
        id: app.id,
        coverNote: app.coverNote,
        appliedAt: app.appliedAt,
        worker: app.worker,
      })),
    }));

    return success(res, {
      jobs: transformedJobs,
      count: transformedJobs.length,
    });
  } catch (err: any) {
    console.error("getJobsWithPendingApplications error:", err);
    return fail(res, "Failed to fetch jobs with pending applications", 500);
  }
}

/**
 * GET /api/jobs/:taskId/applications
 * Get all applications for a specific job
 * ADMIN, SUPER_ADMIN only
 */
export async function getJobApplications(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    if (!["ADMIN", "SUPER_ADMIN"].includes(req.user.role)) {
      return fail(res, "Forbidden: Only admins can view job applications", 403);
    }

    const { taskId } = req.params;

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        title: true,
        jobStatus: true,
        paymentAmount: true,
      },
    });

    if (!task) {
      return fail(res, "Task not found", 404);
    }

    const applications = await prisma.jobApplication.findMany({
      where: { taskId },
      include: {
        worker: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            createdAt: true,
            // Get worker stats
            tasksAssigned: {
              where: { status: "DONE" },
              select: { id: true, paymentAmount: true },
            },
          },
        },
        reviewedBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { appliedAt: "asc" },
    });

    const transformedApplications = applications.map((app) => {
      const completedTasks = app.worker.tasksAssigned.length;
      const totalEarnings = app.worker.tasksAssigned.reduce(
        (sum, t) => sum + (t.paymentAmount ? Number(t.paymentAmount) : 0),
        0
      );

      return {
        id: app.id,
        status: app.status,
        coverNote: app.coverNote,
        appliedAt: app.appliedAt,
        reviewedAt: app.reviewedAt,
        rejectionReason: app.rejectionReason,
        reviewedBy: app.reviewedBy,
        worker: {
          id: app.worker.id,
          name: app.worker.name,
          email: app.worker.email,
          phone: app.worker.phone,
          memberSince: app.worker.createdAt,
          completedTasks,
          totalEarnings,
        },
      };
    });

    return success(res, {
      task: {
        id: task.id,
        title: task.title,
        jobStatus: task.jobStatus,
        paymentAmount: task.paymentAmount ? Number(task.paymentAmount) : null,
      },
      applications: transformedApplications,
      count: transformedApplications.length,
    });
  } catch (err: any) {
    console.error("getJobApplications error:", err);
    return fail(res, "Failed to fetch job applications", 500);
  }
}

/**
 * POST /api/jobs/applications/:applicationId/approve
 * Approve a worker's application and assign them to the job
 * ADMIN, SUPER_ADMIN only
 */
export async function approveApplication(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    if (!["ADMIN", "SUPER_ADMIN"].includes(req.user.role)) {
      return fail(res, "Forbidden: Only admins can approve applications", 403);
    }

    const { applicationId } = req.params;

    // Find the application
    const application = await prisma.jobApplication.findUnique({
      where: { id: applicationId },
      include: {
        task: {
          include: {
            client: { select: { companyName: true } },
          },
        },
        worker: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!application) {
      return fail(res, "Application not found", 404);
    }

    if (application.status !== "PENDING") {
      return fail(res, `Cannot approve application with status: ${application.status}`, 400);
    }

    if (application.task.jobStatus !== "REVIEWING") {
      return fail(res, `Cannot approve application for job with status: ${application.task.jobStatus}`, 400);
    }

    // Approve application and assign worker in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Approve this application
      const approvedApp = await tx.jobApplication.update({
        where: { id: applicationId },
        data: {
          status: "APPROVED",
          reviewedAt: new Date(),
          reviewedById: req.user!.id,
        },
      });

      // Reject all other pending applications for this task
      await tx.jobApplication.updateMany({
        where: {
          taskId: application.taskId,
          id: { not: applicationId },
          status: "PENDING",
        },
        data: {
          status: "REJECTED",
          reviewedAt: new Date(),
          reviewedById: req.user!.id,
          rejectionReason: "Another applicant was selected",
        },
      });

      // Assign worker to task and update job status
      await tx.task.update({
        where: { id: application.taskId },
        data: {
          assignedToId: application.workerId,
          jobStatus: "ASSIGNED",
          isPublic: false,  // Remove from job board
          status: "NOT_STARTED",  // Ready for worker to accept
        },
      });

      // Notify the approved worker
      await tx.notification.create({
        data: {
          userId: application.workerId,
          type: "APPLICATION_APPROVED",
          title: "Application Approved! 🎉",
          body: `Your application for "${application.task.title}" has been approved. Please accept the task to begin work.`,
        },
      });

      // Notify rejected workers
      const rejectedApplications = await tx.jobApplication.findMany({
        where: {
          taskId: application.taskId,
          status: "REJECTED",
          id: { not: applicationId },
        },
        select: { workerId: true },
      });

      for (const rejected of rejectedApplications) {
        await tx.notification.create({
          data: {
            userId: rejected.workerId,
            type: "APPLICATION_REJECTED",
            title: "Application Update",
            body: `Your application for "${application.task.title}" was not selected. Keep applying!`,
          },
        });
      }

      // Audit log
      await tx.auditLog.create({
        data: {
          userId: req.user!.id,
          actionType: "JOB_APPLICATION_APPROVED",
          entityType: "TASK",
          entityId: application.taskId,
          metaJson: {
            applicationId,
            approvedWorkerId: application.workerId,
            approvedWorkerName: application.worker.name,
            jobTitle: application.task.title,
          },
        },
      });

      return approvedApp;
    });

    return success(res, {
      message: `Application approved. ${application.worker.name} has been assigned to the job.`,
      application: result,
    });
  } catch (err: any) {
    console.error("approveApplication error:", err);
    return fail(res, "Failed to approve application", 500);
  }
}

/**
 * POST /api/jobs/applications/:applicationId/reject
 * Reject a worker's application
 * ADMIN, SUPER_ADMIN only
 */
export async function rejectApplication(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    if (!["ADMIN", "SUPER_ADMIN"].includes(req.user.role)) {
      return fail(res, "Forbidden: Only admins can reject applications", 403);
    }

    const { applicationId } = req.params;
    const { reason } = req.body;

    // Find the application
    const application = await prisma.jobApplication.findUnique({
      where: { id: applicationId },
      include: {
        task: { select: { id: true, title: true, jobStatus: true } },
        worker: { select: { id: true, name: true } },
      },
    });

    if (!application) {
      return fail(res, "Application not found", 404);
    }

    if (application.status !== "PENDING") {
      return fail(res, `Cannot reject application with status: ${application.status}`, 400);
    }

    // Reject application in transaction
    const result = await prisma.$transaction(async (tx) => {
      const rejectedApp = await tx.jobApplication.update({
        where: { id: applicationId },
        data: {
          status: "REJECTED",
          reviewedAt: new Date(),
          reviewedById: req.user!.id,
          rejectionReason: reason || null,
        },
      });

      // Check if there are other pending applications
      const remainingPending = await tx.jobApplication.count({
        where: {
          taskId: application.taskId,
          status: "PENDING",
        },
      });

      // If no more pending applications, revert job to OPEN
      if (remainingPending === 0 && application.task.jobStatus === "REVIEWING") {
        await tx.task.update({
          where: { id: application.taskId },
          data: { jobStatus: "OPEN" },
        });
      }

      // Notify the rejected worker
      await tx.notification.create({
        data: {
          userId: application.workerId,
          type: "APPLICATION_REJECTED",
          title: "Application Update",
          body: `Your application for "${application.task.title}" was not selected${reason ? `: ${reason}` : ". Keep applying!"}`,
        },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          userId: req.user!.id,
          actionType: "JOB_APPLICATION_REJECTED",
          entityType: "TASK",
          entityId: application.taskId,
          metaJson: {
            applicationId,
            rejectedWorkerId: application.workerId,
            rejectedWorkerName: application.worker.name,
            jobTitle: application.task.title,
            reason: reason || null,
          },
        },
      });

      return rejectedApp;
    });

    return success(res, {
      message: "Application rejected",
      application: result,
    });
  } catch (err: any) {
    console.error("rejectApplication error:", err);
    return fail(res, "Failed to reject application", 500);
  }
}

/**
 * POST /api/jobs/:taskId/reopen
 * Reopen a job for applications (after assigned worker declines)
 * ADMIN, SUPER_ADMIN only
 */
export async function reopenJob(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    if (!["ADMIN", "SUPER_ADMIN"].includes(req.user.role)) {
      return fail(res, "Forbidden: Only admins can reopen jobs", 403);
    }

    const { taskId } = req.params;

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        applications: {
          where: { status: "PENDING" },
        },
      },
    });

    if (!task) {
      return fail(res, "Task not found", 404);
    }

    // Can only reopen ASSIGNED tasks (where worker may have declined)
    // or REVIEWING tasks (to get more applications)
    if (!["ASSIGNED", "REVIEWING"].includes(task.jobStatus)) {
      return fail(res, `Cannot reopen job with status: ${task.jobStatus}`, 400);
    }

    // Determine new status based on pending applications
    const hasOtherPendingApplications = task.applications.length > 0;
    const newStatus = hasOtherPendingApplications ? "REVIEWING" : "OPEN";

    const updatedTask = await prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id: taskId },
        data: {
          jobStatus: newStatus,
          isPublic: true,
          assignedToId: null,
          status: "NOT_STARTED",
        },
      });

      // Notify workers if reopened to OPEN
      if (newStatus === "OPEN") {
        const workers = await tx.user.findMany({
          where: { role: "WORKER", active: true },
          select: { id: true },
        });

        for (const worker of workers) {
          await tx.notification.create({
            data: {
              userId: worker.id,
              type: "JOB_REOPENED",
              title: "Job Available Again",
              body: `"${task.title}" is available for applications again.`,
            },
          });
        }
      }

      // Audit log
      await tx.auditLog.create({
        data: {
          userId: req.user!.id,
          actionType: "JOB_REOPENED",
          entityType: "TASK",
          entityId: taskId,
          metaJson: {
            jobTitle: task.title,
            newStatus,
          },
        },
      });

      return updated;
    });

    return success(res, {
      message: `Job reopened with status: ${newStatus}`,
      task: updatedTask,
    });
  } catch (err: any) {
    console.error("reopenJob error:", err);
    return fail(res, "Failed to reopen job", 500);
  }
}

/**
 * GET /api/jobs/all
 * Get all jobs (for admin job board management)
 * ADMIN, SUPER_ADMIN only
 */
export async function getAllJobs(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    if (!["ADMIN", "SUPER_ADMIN"].includes(req.user.role)) {
      return fail(res, "Forbidden", 403);
    }

    const { status, search } = req.query;

    const where: Prisma.TaskWhereInput = {};

    if (status && typeof status === "string") {
      where.jobStatus = status as any;
    }

    if (search && typeof search === "string") {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { client: { companyName: { contains: search, mode: "insensitive" } } },
      ];
    }

    const jobs = await prisma.task.findMany({
      where,
      include: {
        client: {
          select: {
            id: true,
            companyName: true,
          },
        },
        assignedTo: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            applications: { where: { status: "PENDING" } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const transformedJobs = jobs.map((job) => ({
      id: job.id,
      title: job.title,
      description: job.description,
      priority: job.priority,
      status: job.status,
      jobStatus: job.jobStatus,
      isPublic: job.isPublic,
      paymentAmount: job.paymentAmount ? Number(job.paymentAmount) : null,
      workerPaymentStatus: job.workerPaymentStatus,
      deadline: job.deadline,
      dueDate: job.dueDate,
      postedAt: job.postedAt,
      createdAt: job.createdAt,
      client: job.client,
      assignedTo: job.assignedTo,
      pendingApplicationCount: job._count.applications,
    }));

    return success(res, {
      jobs: transformedJobs,
      count: transformedJobs.length,
    });
  } catch (err: any) {
    console.error("getAllJobs error:", err);
    return fail(res, "Failed to fetch jobs", 500);
  }
}

// ============================================
// NEW: SUPER_ADMIN ONLY - BROADCAST HISTORY
// ============================================

/**
 * GET /api/jobs/broadcast-history
 * Get complete history of all broadcasted jobs
 * SUPER_ADMIN only - shows who posted each job
 */
export async function getBroadcastHistory(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    // SUPER_ADMIN only
    if (req.user.role !== "SUPER_ADMIN") {
      return fail(res, "Forbidden: Only super admins can view broadcast history", 403);
    }

    const { status, postedById, startDate, endDate } = req.query;

    // Build where clause - only jobs that have been broadcasted (not DRAFT)
    const where: Prisma.TaskWhereInput = {
      jobStatus: { not: "DRAFT" },
      postedAt: { not: null },
    };

    // Filter by job status
    if (status && typeof status === "string") {
      where.jobStatus = status as any;
    }

    // Filter by who posted
    if (postedById && typeof postedById === "string") {
      where.postedById = postedById;
    }

    // Filter by date range
    if (startDate && typeof startDate === "string") {
      where.postedAt = {
        ...(where.postedAt as object || {}),
        gte: new Date(startDate),
      };
    }
    if (endDate && typeof endDate === "string") {
      where.postedAt = {
        ...(where.postedAt as object || {}),
        lte: new Date(endDate),
      };
    }

    const jobs = await prisma.task.findMany({
      where,
      include: {
        client: {
          select: {
            id: true,
            companyName: true,
          },
        },
        postedBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        _count: {
          select: {
            applications: true,
          },
        },
      },
      orderBy: { postedAt: "desc" },
    });

    const transformedJobs = jobs.map((job) => ({
      id: job.id,
      title: job.title,
      description: job.description,
      priority: job.priority,
      jobStatus: job.jobStatus,
      taskStatus: job.status,
      paymentAmount: job.paymentAmount ? Number(job.paymentAmount) : null,
      workerPaymentStatus: job.workerPaymentStatus,
      deadline: job.deadline,
      postedAt: job.postedAt,
      createdAt: job.createdAt,
      client: job.client,
      postedBy: job.postedBy,
      assignedTo: job.assignedTo,
      totalApplications: job._count.applications,
    }));

    // Get list of admins who have posted jobs (for filter dropdown)
    const posters = await prisma.user.findMany({
      where: {
        role: { in: ["ADMIN", "SUPER_ADMIN"] },
        tasksPosted: { some: {} },
      },
      select: {
        id: true,
        name: true,
        role: true,
      },
    });

    // Summary stats
    const stats = {
      totalBroadcasted: transformedJobs.length,
      open: transformedJobs.filter(j => j.jobStatus === "OPEN").length,
      reviewing: transformedJobs.filter(j => j.jobStatus === "REVIEWING").length,
      assigned: transformedJobs.filter(j => j.jobStatus === "ASSIGNED").length,
      inProgress: transformedJobs.filter(j => j.jobStatus === "IN_PROGRESS").length,
      completed: transformedJobs.filter(j => j.jobStatus === "COMPLETED").length,
      cancelled: transformedJobs.filter(j => j.jobStatus === "CANCELLED").length,
      totalPaymentValue: transformedJobs.reduce((sum, j) => sum + (j.paymentAmount || 0), 0),
    };

    return success(res, {
      jobs: transformedJobs,
      stats,
      posters,
      count: transformedJobs.length,
    });
  } catch (err: any) {
    console.error("getBroadcastHistory error:", err);
    return fail(res, "Failed to fetch broadcast history", 500);
  }
}
