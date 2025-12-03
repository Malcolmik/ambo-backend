import { Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthedRequest } from "../../middleware/auth";
import { success, fail } from "../../utils/response";

/**
 * GET /api/analytics/overview
 * Get overview analytics (revenue, clients, tasks, etc)
 * SUPER_ADMIN only
 */
export async function getOverview(req: AuthedRequest, res: Response) {
  try {
    if (!req.user || req.user.role !== "SUPER_ADMIN") {
      return fail(res, "Forbidden: Only super admins can access analytics", 403);
    }

    // Get counts
    const [
      totalClients,
      activeClients,
      totalContracts,
      totalTasks,
      openTasks,
      totalUsers,
      activeWorkers,
    ] = await Promise.all([
      prisma.client.count(),
      prisma.client.count({
        where: {
          contracts: {
            some: {
              status: { in: ["IN_PROGRESS", "READY_FOR_ASSIGNMENT"] },
            },
          },
        },
      }),
      prisma.contract.count(),
      prisma.task.count(),
      prisma.task.count({
        where: { status: { in: ["NOT_STARTED", "IN_PROGRESS"] } },
      }),
      prisma.user.count(),
      prisma.user.count({
        where: { role: "WORKER", active: true },
      }),
    ]);

    // Get revenue data
    const payments = await prisma.payment.findMany({
      where: { status: "PAID" },
      select: {
        amount: true,
        currency: true,
        paidAt: true,
      },
    });

    const totalRevenue = payments.reduce((sum, p) => sum + Number(p.amount), 0);

    // Get this month's revenue
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonthRevenue = payments
      .filter((p) => p.paidAt && new Date(p.paidAt) >= startOfMonth)
      .reduce((sum, p) => sum + Number(p.amount), 0);

    // Get contract status breakdown
    const contractsByStatus = await prisma.contract.groupBy({
      by: ["status"],
      _count: true,
    });

    // Get task status breakdown
    const tasksByStatus = await prisma.task.groupBy({
      by: ["status"],
      _count: true,
    });

    return success(res, {
      clients: {
        total: totalClients,
        active: activeClients,
      },
      contracts: {
        total: totalContracts,
        byStatus: contractsByStatus.reduce((acc: any, item) => {
          acc[item.status] = item._count;
          return acc;
        }, {}),
      },
      tasks: {
        total: totalTasks,
        open: openTasks,
        byStatus: tasksByStatus.reduce((acc: any, item) => {
          acc[item.status] = item._count;
          return acc;
        }, {}),
      },
      users: {
        total: totalUsers,
        activeWorkers,
      },
      revenue: {
        total: totalRevenue,
        thisMonth: thisMonthRevenue,
        currency: "NGN", // Default currency
      },
    });
  } catch (err: any) {
    console.error("getOverview error:", err);
    return fail(res, "Failed to get analytics overview", 500);
  }
}

/**
 * GET /api/analytics/revenue
 * Get revenue analytics by month
 * SUPER_ADMIN only
 */
export async function getRevenueAnalytics(req: AuthedRequest, res: Response) {
  try {
    if (!req.user || req.user.role !== "SUPER_ADMIN") {
      return fail(res, "Forbidden: Only super admins can access analytics", 403);
    }

    const payments = await prisma.payment.findMany({
      where: { status: "PAID", paidAt: { not: null } },
      select: {
        amount: true,
        currency: true,
        paidAt: true,
        contract: {
          select: {
            packageType: true,
          },
        },
      },
      orderBy: { paidAt: "asc" },
    });

    // Group by month
    const revenueByMonth: any = {};
    const revenueByPackage: any = {};

    payments.forEach((payment) => {
      if (!payment.paidAt) return;

      const date = new Date(payment.paidAt);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

      if (!revenueByMonth[monthKey]) {
        revenueByMonth[monthKey] = 0;
      }
      revenueByMonth[monthKey] += Number(payment.amount);

      // By package type
      const packageType = payment.contract?.packageType || "UNKNOWN";
      if (!revenueByPackage[packageType]) {
        revenueByPackage[packageType] = 0;
      }
      revenueByPackage[packageType] += Number(payment.amount);
    });

    // Convert to arrays
    const monthlyRevenue = Object.keys(revenueByMonth)
      .sort()
      .map((month) => ({
        month,
        revenue: revenueByMonth[month],
      }));

    const packageRevenue = Object.keys(revenueByPackage).map((packageType) => ({
      packageType,
      revenue: revenueByPackage[packageType],
    }));

    return success(res, {
      monthlyRevenue,
      packageRevenue,
      totalPayments: payments.length,
      totalRevenue: payments.reduce((sum, p) => sum + Number(p.amount), 0),
    });
  } catch (err: any) {
    console.error("getRevenueAnalytics error:", err);
    return fail(res, "Failed to get revenue analytics", 500);
  }
}

/**
 * GET /api/analytics/worker-performance
 * Get worker performance stats
 * SUPER_ADMIN only
 */
export async function getWorkerPerformance(req: AuthedRequest, res: Response) {
  try {
    if (!req.user || req.user.role !== "SUPER_ADMIN") {
      return fail(res, "Forbidden: Only super admins can access analytics", 403);
    }

    const workers = await prisma.user.findMany({
      where: { role: "WORKER" },
      select: {
        id: true,
        name: true,
        email: true,
        active: true,
        tasksAssigned: {
          select: {
            id: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    const workerStats = workers.map((worker) => {
      const tasks = worker.tasksAssigned;
      const completedTasks = tasks.filter((t) => t.status === "DONE");
      const inProgressTasks = tasks.filter((t) => t.status === "IN_PROGRESS");
      const pendingTasks = tasks.filter((t) => t.status === "NOT_STARTED");

      // Calculate average completion time (days)
      const completedWithTimes = completedTasks.filter(
        (t) => t.createdAt && t.updatedAt
      );
      const avgCompletionTime =
        completedWithTimes.length > 0
          ? completedWithTimes.reduce((sum, t) => {
              const days =
                (new Date(t.updatedAt).getTime() -
                  new Date(t.createdAt).getTime()) /
                (1000 * 60 * 60 * 24);
              return sum + days;
            }, 0) / completedWithTimes.length
          : 0;

      return {
        workerId: worker.id,
        workerName: worker.name,
        workerEmail: worker.email,
        active: worker.active,
        totalTasks: tasks.length,
        completedTasks: completedTasks.length,
        inProgressTasks: inProgressTasks.length,
        pendingTasks: pendingTasks.length,
        completionRate:
          tasks.length > 0
            ? Math.round((completedTasks.length / tasks.length) * 100)
            : 0,
        avgCompletionDays: Math.round(avgCompletionTime * 10) / 10,
      };
    });

    // Sort by completion rate
    workerStats.sort((a, b) => b.completionRate - a.completionRate);

    return success(res, {
      workers: workerStats,
      totalWorkers: workers.length,
      activeWorkers: workers.filter((w) => w.active).length,
    });
  } catch (err: any) {
    console.error("getWorkerPerformance error:", err);
    return fail(res, "Failed to get worker performance", 500);
  }
}
