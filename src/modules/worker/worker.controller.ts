import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthedRequest } from "../../middleware/auth";
import { success, fail } from "../../utils/response";
import { Prisma } from "@prisma/client";

// ============================================
// WORKER DASHBOARD & EARNINGS
// ============================================

/**
 * GET /api/worker/dashboard
 * Get comprehensive worker dashboard data
 * WORKER only
 */
export async function getWorkerDashboard(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    if (req.user.role !== "WORKER") {
      return fail(res, "Forbidden: Only workers can access this endpoint", 403);
    }

    const workerId = req.user.id;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Get task counts by status
    const [
      totalAssigned,
      inProgress,
      completed,
      pendingAcceptance,
    ] = await Promise.all([
      prisma.task.count({
        where: { assignedToId: workerId },
      }),
      prisma.task.count({
        where: { assignedToId: workerId, status: "IN_PROGRESS" },
      }),
      prisma.task.count({
        where: { assignedToId: workerId, status: "DONE" },
      }),
      prisma.task.count({
        where: {
          assignedToId: workerId,
          status: "NOT_STARTED",
          jobStatus: "ASSIGNED",
        },
      }),
    ]);

    // Get earnings data
    const allCompletedTasks = await prisma.task.findMany({
      where: {
        assignedToId: workerId,
        status: "DONE",
        paymentAmount: { not: null },
      },
      select: {
        paymentAmount: true,
        workerPaymentStatus: true,
        updatedAt: true,
      },
    });

    const totalEarnings = allCompletedTasks.reduce(
      (sum, t) => sum + (t.paymentAmount ? Number(t.paymentAmount) : 0),
      0
    );

    const paidEarnings = allCompletedTasks
      .filter((t) => t.workerPaymentStatus === "PAID")
      .reduce((sum, t) => sum + (t.paymentAmount ? Number(t.paymentAmount) : 0), 0);

    const pendingPayment = totalEarnings - paidEarnings;

    // This month's earnings
    const thisMonthTasks = allCompletedTasks.filter(
      (t) => t.updatedAt >= startOfMonth
    );
    const thisMonthEarnings = thisMonthTasks.reduce(
      (sum, t) => sum + (t.paymentAmount ? Number(t.paymentAmount) : 0),
      0
    );

    // Get pending applications count
    const pendingApplications = await prisma.jobApplication.count({
      where: {
        workerId,
        status: "PENDING",
      },
    });

    // Get available jobs count
    const availableJobs = await prisma.task.count({
      where: {
        isPublic: true,
        jobStatus: { in: ["OPEN", "REVIEWING"] },
      },
    });

    // Get recent tasks (last 5)
    const recentTasks = await prisma.task.findMany({
      where: { assignedToId: workerId },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        status: true,
        jobStatus: true,
        paymentAmount: true,
        workerPaymentStatus: true,
        dueDate: true,
        client: {
          select: {
            companyName: true,
          },
        },
      },
    });

    return success(res, {
      stats: {
        tasks: {
          total: totalAssigned,
          inProgress,
          completed,
          pendingAcceptance,
        },
        earnings: {
          total: totalEarnings,
          paid: paidEarnings,
          pending: pendingPayment,
          thisMonth: thisMonthEarnings,
        },
        applications: {
          pending: pendingApplications,
        },
        availableJobs,
      },
      recentTasks: recentTasks.map((t) => ({
        ...t,
        paymentAmount: t.paymentAmount ? Number(t.paymentAmount) : null,
      })),
    });
  } catch (err: any) {
    console.error("getWorkerDashboard error:", err);
    return fail(res, "Failed to load dashboard", 500);
  }
}

/**
 * GET /api/worker/earnings
 * Get detailed earnings breakdown
 * WORKER only
 */
export async function getWorkerEarnings(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    if (req.user.role !== "WORKER") {
      return fail(res, "Forbidden: Only workers can access this endpoint", 403);
    }

    const workerId = req.user.id;
    const { year } = req.query;

    const targetYear = year ? parseInt(year as string) : new Date().getFullYear();

    // Get all completed tasks with payments
    const completedTasks = await prisma.task.findMany({
      where: {
        assignedToId: workerId,
        status: "DONE",
        paymentAmount: { not: null },
      },
      select: {
        id: true,
        title: true,
        paymentAmount: true,
        workerPaymentStatus: true,
        paidAt: true,
        updatedAt: true,
        client: {
          select: {
            companyName: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    // Calculate totals
    const totalEarnings = completedTasks.reduce(
      (sum, t) => sum + (t.paymentAmount ? Number(t.paymentAmount) : 0),
      0
    );

    const paidAmount = completedTasks
      .filter((t) => t.workerPaymentStatus === "PAID")
      .reduce((sum, t) => sum + (t.paymentAmount ? Number(t.paymentAmount) : 0), 0);

    const pendingAmount = totalEarnings - paidAmount;

    // Group by month for the target year
    const monthlyBreakdown: Record<string, { earned: number; paid: number; tasks: number }> = {};

    for (let month = 0; month < 12; month++) {
      const monthKey = `${targetYear}-${String(month + 1).padStart(2, "0")}`;
      monthlyBreakdown[monthKey] = { earned: 0, paid: 0, tasks: 0 };
    }

    completedTasks.forEach((task) => {
      const taskDate = new Date(task.updatedAt);
      if (taskDate.getFullYear() === targetYear) {
        const monthKey = `${targetYear}-${String(taskDate.getMonth() + 1).padStart(2, "0")}`;
        const amount = task.paymentAmount ? Number(task.paymentAmount) : 0;
        
        monthlyBreakdown[monthKey].earned += amount;
        monthlyBreakdown[monthKey].tasks += 1;
        
        if (task.workerPaymentStatus === "PAID") {
          monthlyBreakdown[monthKey].paid += amount;
        }
      }
    });

    // Convert to array format
    const monthlyData = Object.entries(monthlyBreakdown)
      .sort(([a], [b]) => b.localeCompare(a)) // Sort descending
      .map(([month, data]) => ({
        month,
        ...data,
      }));

    // This month's data
    const now = new Date();
    const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const thisMonthData = monthlyBreakdown[thisMonthKey] || { earned: 0, paid: 0, tasks: 0 };

    // Recent payments (completed tasks sorted by payment status and date)
    const recentPayments = completedTasks
      .slice(0, 10)
      .map((t) => ({
        id: t.id,
        title: t.title,
        clientName: t.client?.companyName || "Unknown",
        amount: t.paymentAmount ? Number(t.paymentAmount) : 0,
        status: t.workerPaymentStatus,
        paidAt: t.paidAt,
        completedAt: t.updatedAt,
      }));

    return success(res, {
      summary: {
        totalEarnings,
        paidAmount,
        pendingAmount,
        thisMonth: thisMonthData.earned,
        thisMonthTasks: thisMonthData.tasks,
      },
      monthlyBreakdown: monthlyData,
      recentPayments,
      year: targetYear,
    });
  } catch (err: any) {
    console.error("getWorkerEarnings error:", err);
    return fail(res, "Failed to load earnings", 500);
  }
}

/**
 * GET /api/worker/task-history
 * Get completed tasks grouped by month with filtering
 * WORKER only
 */
export async function getTaskHistory(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    if (req.user.role !== "WORKER") {
      return fail(res, "Forbidden: Only workers can access this endpoint", 403);
    }

    const workerId = req.user.id;
    const { month, year, status, page = "1", limit = "20" } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // Build where clause
    const where: Prisma.TaskWhereInput = {
      assignedToId: workerId,
    };

    // Filter by status (default to completed tasks)
    if (status && typeof status === "string") {
      where.status = status as any;
    } else {
      where.status = "DONE";
    }

    // Filter by month/year if provided
    if (month && year) {
      const monthNum = parseInt(month as string);
      const yearNum = parseInt(year as string);
      const startDate = new Date(yearNum, monthNum - 1, 1);
      const endDate = new Date(yearNum, monthNum, 0, 23, 59, 59);
      
      where.updatedAt = {
        gte: startDate,
        lte: endDate,
      };
    } else if (year) {
      const yearNum = parseInt(year as string);
      where.updatedAt = {
        gte: new Date(yearNum, 0, 1),
        lte: new Date(yearNum, 11, 31, 23, 59, 59),
      };
    }

    // Get tasks
    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip,
        take: limitNum,
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          priority: true,
          paymentAmount: true,
          workerPaymentStatus: true,
          paidAt: true,
          dueDate: true,
          createdAt: true,
          updatedAt: true,
          client: {
            select: {
              id: true,
              companyName: true,
              logoUrl: true,
            },
          },
        },
      }),
      prisma.task.count({ where }),
    ]);

    // Group by month
    const groupedByMonth: Record<string, any[]> = {};
    
    tasks.forEach((task) => {
      const date = new Date(task.updatedAt);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      
      if (!groupedByMonth[monthKey]) {
        groupedByMonth[monthKey] = [];
      }
      
      groupedByMonth[monthKey].push({
        ...task,
        paymentAmount: task.paymentAmount ? Number(task.paymentAmount) : null,
      });
    });

    // Calculate month totals
    const monthSummaries = Object.entries(groupedByMonth).map(([month, monthTasks]) => ({
      month,
      taskCount: monthTasks.length,
      totalEarnings: monthTasks.reduce(
        (sum, t) => sum + (t.paymentAmount || 0),
        0
      ),
      tasks: monthTasks,
    }));

    return success(res, {
      tasks: tasks.map((t) => ({
        ...t,
        paymentAmount: t.paymentAmount ? Number(t.paymentAmount) : null,
      })),
      groupedByMonth: monthSummaries,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (err: any) {
    console.error("getTaskHistory error:", err);
    return fail(res, "Failed to load task history", 500);
  }
}

/**
 * GET /api/worker/export/payments
 * Export payment history as JSON (can be converted to CSV on frontend)
 * WORKER only
 */
export async function exportPaymentHistory(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    if (req.user.role !== "WORKER") {
      return fail(res, "Forbidden: Only workers can export their payment history", 403);
    }

    const workerId = req.user.id;
    const { year, status } = req.query;

    const where: Prisma.TaskWhereInput = {
      assignedToId: workerId,
      status: "DONE",
      paymentAmount: { not: null },
    };

    if (year) {
      const yearNum = parseInt(year as string);
      where.updatedAt = {
        gte: new Date(yearNum, 0, 1),
        lte: new Date(yearNum, 11, 31, 23, 59, 59),
      };
    }

    if (status && typeof status === "string") {
      where.workerPaymentStatus = status as any;
    }

    const payments = await prisma.task.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        paymentAmount: true,
        workerPaymentStatus: true,
        paidAt: true,
        updatedAt: true,
        client: {
          select: {
            companyName: true,
          },
        },
      },
    });

    const exportData = payments.map((p) => ({
      taskId: p.id,
      taskTitle: p.title,
      clientName: p.client?.companyName || "Unknown",
      amount: p.paymentAmount ? Number(p.paymentAmount) : 0,
      currency: "NGN",
      paymentStatus: p.workerPaymentStatus,
      completedDate: p.updatedAt.toISOString().split("T")[0],
      paidDate: p.paidAt ? p.paidAt.toISOString().split("T")[0] : null,
    }));

    const totals = {
      totalAmount: exportData.reduce((sum, p) => sum + p.amount, 0),
      totalTasks: exportData.length,
      paidAmount: exportData
        .filter((p) => p.paymentStatus === "PAID")
        .reduce((sum, p) => sum + p.amount, 0),
      pendingAmount: exportData
        .filter((p) => p.paymentStatus !== "PAID")
        .reduce((sum, p) => sum + p.amount, 0),
    };

    return success(res, {
      worker: {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
      },
      exportedAt: new Date().toISOString(),
      filters: {
        year: year || "all",
        status: status || "all",
      },
      totals,
      payments: exportData,
    });
  } catch (err: any) {
    console.error("exportPaymentHistory error:", err);
    return fail(res, "Failed to export payment history", 500);
  }
}

// ============================================
// ADMIN PAYMENT MANAGEMENT
// ============================================

/**
 * GET /api/worker/admin/payments
 * Get all pending worker payments
 * ADMIN, SUPER_ADMIN only
 */
export async function getPendingWorkerPayments(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    if (!["ADMIN", "SUPER_ADMIN"].includes(req.user.role)) {
      return fail(res, "Forbidden", 403);
    }

    const { status = "PENDING" } = req.query;

    const tasks = await prisma.task.findMany({
      where: {
        status: "DONE",
        paymentAmount: { not: null },
        workerPaymentStatus: status as any,
        assignedToId: { not: null },
      },
      include: {
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        client: {
          select: {
            id: true,
            companyName: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    const payments = tasks.map((t) => ({
      taskId: t.id,
      taskTitle: t.title,
      worker: t.assignedTo,
      client: t.client,
      amount: t.paymentAmount ? Number(t.paymentAmount) : 0,
      status: t.workerPaymentStatus,
      completedAt: t.updatedAt,
      paidAt: t.paidAt,
    }));

    const totalPending = payments
      .filter((p) => p.status === "PENDING")
      .reduce((sum, p) => sum + p.amount, 0);

    return success(res, {
      payments,
      count: payments.length,
      totalPending,
    });
  } catch (err: any) {
    console.error("getPendingWorkerPayments error:", err);
    return fail(res, "Failed to fetch pending payments", 500);
  }
}

/**
 * POST /api/worker/admin/payments/:taskId/mark-paid
 * Mark a worker's task payment as paid
 * ADMIN, SUPER_ADMIN only
 */
export async function markPaymentAsPaid(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    if (!["ADMIN", "SUPER_ADMIN"].includes(req.user.role)) {
      return fail(res, "Forbidden", 403);
    }

    const { taskId } = req.params;

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        assignedTo: {
          select: { id: true, name: true },
        },
      },
    });

    if (!task) {
      return fail(res, "Task not found", 404);
    }

    if (task.status !== "DONE") {
      return fail(res, "Can only mark payment for completed tasks", 400);
    }

    if (!task.paymentAmount) {
      return fail(res, "Task has no payment amount set", 400);
    }

    if (task.workerPaymentStatus === "PAID") {
      return fail(res, "Payment already marked as paid", 400);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updatedTask = await tx.task.update({
        where: { id: taskId },
        data: {
          workerPaymentStatus: "PAID",
          paidAt: new Date(),
          paidById: req.user!.id,
        },
      });

      // Notify worker
      if (task.assignedToId) {
        await tx.notification.create({
          data: {
            userId: task.assignedToId,
            type: "PAYMENT_RECEIVED",
            title: "Payment Received! 💰",
            body: `Payment of ₦${Number(task.paymentAmount).toLocaleString()} for "${task.title}" has been processed.`,
          },
        });
      }

      // Audit log
      await tx.auditLog.create({
        data: {
          userId: req.user!.id,
          actionType: "WORKER_PAYMENT_MARKED_PAID",
          entityType: "TASK",
          entityId: taskId,
          metaJson: {
            workerId: task.assignedToId,
            workerName: task.assignedTo?.name,
            amount: Number(task.paymentAmount),
            taskTitle: task.title,
          },
        },
      });

      return updatedTask;
    });

    return success(res, {
      message: "Payment marked as paid",
      task: {
        id: updated.id,
        title: updated.title,
        paymentAmount: updated.paymentAmount ? Number(updated.paymentAmount) : null,
        workerPaymentStatus: updated.workerPaymentStatus,
        paidAt: updated.paidAt,
      },
    });
  } catch (err: any) {
    console.error("markPaymentAsPaid error:", err);
    return fail(res, "Failed to mark payment as paid", 500);
  }
}

/**
 * POST /api/worker/admin/payments/bulk-pay
 * Mark multiple payments as paid at once
 * ADMIN, SUPER_ADMIN only
 */
export async function bulkMarkPaymentsAsPaid(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    if (!["ADMIN", "SUPER_ADMIN"].includes(req.user.role)) {
      return fail(res, "Forbidden", 403);
    }

    const { taskIds } = req.body;

    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return fail(res, "taskIds array is required", 400);
    }

    // Get all tasks
    const tasks = await prisma.task.findMany({
      where: {
        id: { in: taskIds },
        status: "DONE",
        paymentAmount: { not: null },
        workerPaymentStatus: "PENDING",
      },
      include: {
        assignedTo: {
          select: { id: true, name: true },
        },
      },
    });

    if (tasks.length === 0) {
      return fail(res, "No eligible tasks found", 400);
    }

    // Process all payments
    const results = await prisma.$transaction(async (tx) => {
      const updated: any[] = [];

      for (const task of tasks) {
        await tx.task.update({
          where: { id: task.id },
          data: {
            workerPaymentStatus: "PAID",
            paidAt: new Date(),
            paidById: req.user!.id,
          },
        });

        // Notify worker
        if (task.assignedToId) {
          await tx.notification.create({
            data: {
              userId: task.assignedToId,
              type: "PAYMENT_RECEIVED",
              title: "Payment Received! 💰",
              body: `Payment of ₦${Number(task.paymentAmount).toLocaleString()} for "${task.title}" has been processed.`,
            },
          });
        }

        updated.push({
          taskId: task.id,
          taskTitle: task.title,
          workerId: task.assignedToId,
          workerName: task.assignedTo?.name,
          amount: Number(task.paymentAmount),
        });
      }

      // Single audit log for bulk action
      await tx.auditLog.create({
        data: {
          userId: req.user!.id,
          actionType: "WORKER_PAYMENTS_BULK_PAID",
          entityType: "TASK",
          entityId: tasks[0].id,
          metaJson: {
            taskCount: tasks.length,
            totalAmount: tasks.reduce((sum, t) => sum + (t.paymentAmount ? Number(t.paymentAmount) : 0), 0),
            taskIds: tasks.map((t) => t.id),
          },
        },
      });

      return updated;
    });

    const totalPaid = results.reduce((sum, r) => sum + r.amount, 0);

    return success(res, {
      message: `${results.length} payments marked as paid`,
      totalPaid,
      payments: results,
    });
  } catch (err: any) {
    console.error("bulkMarkPaymentsAsPaid error:", err);
    return fail(res, "Failed to process bulk payments", 500);
  }
}

/**
 * GET /api/worker/admin/earnings-overview
 * Get earnings overview for all workers
 * SUPER_ADMIN only (financial data)
 */
export async function getWorkersEarningsOverview(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    // Only SUPER_ADMIN can see financial overview
    if (req.user.role !== "SUPER_ADMIN") {
      return fail(res, "Forbidden: Only super admins can access earnings overview", 403);
    }

    const workers = await prisma.user.findMany({
      where: { role: "WORKER" },
      select: {
        id: true,
        name: true,
        email: true,
        active: true,
        tasksAssigned: {
          where: {
            status: "DONE",
            paymentAmount: { not: null },
          },
          select: {
            paymentAmount: true,
            workerPaymentStatus: true,
          },
        },
      },
    });

    const workerEarnings = workers.map((worker) => {
      const totalEarned = worker.tasksAssigned.reduce(
        (sum, t) => sum + (t.paymentAmount ? Number(t.paymentAmount) : 0),
        0
      );
      const paidAmount = worker.tasksAssigned
        .filter((t) => t.workerPaymentStatus === "PAID")
        .reduce((sum, t) => sum + (t.paymentAmount ? Number(t.paymentAmount) : 0), 0);
      const pendingAmount = totalEarned - paidAmount;

      return {
        id: worker.id,
        name: worker.name,
        email: worker.email,
        active: worker.active,
        completedTasks: worker.tasksAssigned.length,
        totalEarned,
        paidAmount,
        pendingAmount,
      };
    });

    // Sort by total earned descending
    workerEarnings.sort((a, b) => b.totalEarned - a.totalEarned);

    const totals = {
      totalWorkers: workers.length,
      totalPaid: workerEarnings.reduce((sum, w) => sum + w.paidAmount, 0),
      totalPending: workerEarnings.reduce((sum, w) => sum + w.pendingAmount, 0),
      totalEarnings: workerEarnings.reduce((sum, w) => sum + w.totalEarned, 0),
    };

    return success(res, {
      workers: workerEarnings,
      totals,
    });
  } catch (err: any) {
    console.error("getWorkersEarningsOverview error:", err);
    return fail(res, "Failed to fetch earnings overview", 500);
  }
}
