import { Router } from "express";
import { authRequired } from "../../middleware/auth";
import { requireRole } from "../../middleware/requireRole";
import {
  // Worker endpoints
  getAvailableJobs,
  getJobDetails,
  applyForJob,
  withdrawApplication,
  getMyApplications,
  // Admin endpoints
  pushToBroadcast,
  getJobsWithPendingApplications,
  getJobApplications,
  approveApplication,
  rejectApplication,
  reopenJob,
  getAllJobs,
} from "./jobs.controller";

const router = Router();

// ============================================
// WORKER ROUTES
// ============================================

// GET /api/jobs/available - Get all available jobs for workers
router.get(
  "/available",
  authRequired,
  requireRole("WORKER"),
  getAvailableJobs
);

// GET /api/jobs/my-applications - Get worker's applications
router.get(
  "/my-applications",
  authRequired,
  requireRole("WORKER"),
  getMyApplications
);

// ============================================
// ADMIN ROUTES (ADMIN + SUPER_ADMIN)
// ============================================

// GET /api/jobs/all - Get all jobs for admin management
router.get(
  "/all",
  authRequired,
  requireRole("ADMIN", "SUPER_ADMIN"),
  getAllJobs
);

// GET /api/jobs/pending-review - Get jobs with pending applications
router.get(
  "/pending-review",
  authRequired,
  requireRole("ADMIN", "SUPER_ADMIN"),
  getJobsWithPendingApplications
);

// POST /api/jobs/:taskId/broadcast - Push task to job board
router.post(
  "/:taskId/broadcast",
  authRequired,
  requireRole("ADMIN", "SUPER_ADMIN"),
  pushToBroadcast
);

// POST /api/jobs/:taskId/reopen - Reopen job for applications
router.post(
  "/:taskId/reopen",
  authRequired,
  requireRole("ADMIN", "SUPER_ADMIN"),
  reopenJob
);

// GET /api/jobs/:taskId/applications - Get all applications for a job
router.get(
  "/:taskId/applications",
  authRequired,
  requireRole("ADMIN", "SUPER_ADMIN"),
  getJobApplications
);

// POST /api/jobs/applications/:applicationId/approve - Approve application
router.post(
  "/applications/:applicationId/approve",
  authRequired,
  requireRole("ADMIN", "SUPER_ADMIN"),
  approveApplication
);

// POST /api/jobs/applications/:applicationId/reject - Reject application
router.post(
  "/applications/:applicationId/reject",
  authRequired,
  requireRole("ADMIN", "SUPER_ADMIN"),
  rejectApplication
);

// ============================================
// SHARED ROUTES (Multiple roles)
// ============================================

// GET /api/jobs/:taskId - Get job details (workers see limited info)
router.get(
  "/:taskId",
  authRequired,
  getJobDetails
);

// POST /api/jobs/:taskId/apply - Worker applies for job
router.post(
  "/:taskId/apply",
  authRequired,
  requireRole("WORKER"),
  applyForJob
);

// DELETE /api/jobs/:taskId/apply - Worker withdraws application
router.delete(
  "/:taskId/apply",
  authRequired,
  requireRole("WORKER"),
  withdrawApplication
);

export default router;
