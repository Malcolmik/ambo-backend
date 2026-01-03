import { Router } from "express";
import {
  submitReview,
  getMyReviews,
  getContractReview,
  getReviewStats,
} from "./reviews.controller";
import { authRequired } from "../../middleware/auth";
import { requireRole } from "../../middleware/requireRole";

const router = Router();

// Submit or update a review
router.post("/", authRequired, submitReview);

// Get my reviews
router.get("/my", authRequired, getMyReviews);

// Get review stats - UPDATED: Added ADMIN role
router.get("/stats", authRequired, requireRole("SUPER_ADMIN", "ADMIN"), getReviewStats);

// Get review for specific contract
router.get("/contract/:contractId", authRequired, getContractReview);

export default router;
