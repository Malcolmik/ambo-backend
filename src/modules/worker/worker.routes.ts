import { Router } from "express";
import { authRequired } from "../../middleware/auth";
import { requireRole } from "../../middleware/requireRole";
import {
  // Worker endpoints
  getWorkerDashboard,
  getWorkerEarnings,
  getTaskHistory,
  exportPaymentHistory,
  // Admin payment management endpoints
  getPendingWorkerPayments,
  markPaymentAsPaid,
  bulkMarkPaymentsAsPaid,
  getWorkersEarningsOverview,
} from "./worker.controller";

const router = Router();

// ============================================
// WORKER ROUTES
// ============================================

// GET /api/worker/dashboard - Get worker dashboard data
router.get(
  "/dashboard",
  authRequired,
  requireRole("WORKER"),
  getWorkerDashboard
);

// GET /api/worker/earnings - Get earnings breakdown
router.get(
  "/earnings",
  authRequired,
  requireRole("WORKER"),
  getWorkerEarnings
);

// GET /api/worker/task-history - Get completed tasks grouped by month
router.get(
  "/task-history",
  authRequired,
  requireRole("WORKER"),
  getTaskHistory
);

// GET /api/worker/export/payments - Export payment history
router.get(
  "/export/payments",
  authRequired,
  requireRole("WORKER"),
  exportPaymentHistory
);

// ============================================
// ADMIN PAYMENT MANAGEMENT ROUTES
// ============================================

// GET /api/worker/admin/payments - Get pending worker payments
router.get(
  "/admin/payments",
  authRequired,
  requireRole("ADMIN", "SUPER_ADMIN"),
  getPendingWorkerPayments
);

// POST /api/worker/admin/payments/:taskId/mark-paid - Mark single payment as paid
router.post(
  "/admin/payments/:taskId/mark-paid",
  authRequired,
  requireRole("ADMIN", "SUPER_ADMIN"),
  markPaymentAsPaid
);

// POST /api/worker/admin/payments/bulk-pay - Mark multiple payments as paid
router.post(
  "/admin/payments/bulk-pay",
  authRequired,
  requireRole("ADMIN", "SUPER_ADMIN"),
  bulkMarkPaymentsAsPaid
);

// GET /api/worker/admin/earnings-overview - Get all workers' earnings (SUPER_ADMIN only)
router.get(
  "/admin/earnings-overview",
  authRequired,
  requireRole("SUPER_ADMIN"),
  getWorkersEarningsOverview
);

export default router;
