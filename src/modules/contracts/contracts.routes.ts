import { Router } from "express";
import {
  getAllContracts,
  myContracts,
  getContract,
  getContractTasks,
  updateContractStatus,
  getContractChatInfo,
  sendbirdSyncUser,
  createContract, 
} from "./contracts.controller";
import { authRequired } from "../../middleware/auth";
import { requireRole } from "../../middleware/requireRole";

const router = Router();

// POST /api/contracts - Create new contract - UPDATED: Added ADMIN role
router.post(
  "/",
  authRequired,
  requireRole("SUPER_ADMIN", "ADMIN"),
  createContract  
);

// GET /api/contracts - Get all contracts - UPDATED: Added ADMIN role
router.get("/", authRequired, requireRole("SUPER_ADMIN", "ADMIN"), getAllContracts);

// GET /api/contracts/my - Get current user's contracts
router.get("/my", authRequired, myContracts);

// GET /api/contracts/:id - Get specific contract
router.get("/:id", authRequired, getContract);

// GET /api/contracts/:id/tasks - Get tasks for a contract
router.get("/:id/tasks", authRequired, getContractTasks);

// GET /api/contracts/:id/chat - Get Sendbird chat info for contract
router.get("/:id/chat", authRequired, getContractChatInfo);

// PATCH /api/contracts/:id/status - Update contract status - UPDATED: Added ADMIN role
router.patch(
  "/:id/status",
  authRequired,
  requireRole("SUPER_ADMIN", "ADMIN"),
  updateContractStatus
);

// POST /api/contracts/sendbird-sync-user - Sync user to Sendbird
router.post("/sendbird-sync-user", authRequired, sendbirdSyncUser);

export default router;
