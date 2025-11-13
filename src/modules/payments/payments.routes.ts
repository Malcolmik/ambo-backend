import { Router } from "express";
import { initiatePayment, verifyPayment } from "./payments.controller";
import { authRequired } from "../../middleware/auth";

const router = Router();

router.post("/initiate", authRequired, initiatePayment);
router.post("/verify", authRequired, verifyPayment);

export default router;
