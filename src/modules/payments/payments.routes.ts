import { Router } from "express";
import { authRequired } from "../../middleware/auth";
import {
  initializePayment,
  initiatePayment,
  verifyPayment,
  paystackWebhook,
} from "./payments.controller";

const router = Router();

// POST /api/payments/initialize - Initialize payment for package selection (NEW - matches frontend)
router.post("/initialize", authRequired, initializePayment);

// POST /api/payments/initiate - Legacy payment initialization (kept for backward compatibility)
router.post("/initiate", authRequired, initiatePayment);

// POST /api/payments/verify - Verify payment status
router.post("/verify", authRequired, verifyPayment);

// POST /api/payments/webhook - Paystack webhook (no auth required)
router.post("/webhook", paystackWebhook);

export default router;
