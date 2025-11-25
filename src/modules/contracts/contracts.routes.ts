import { Router } from "express";
import {
  myContracts,
  getContract,
  getContractTasks,
  updateContractStatus,
  sendbirdSyncUser,
} from "./contracts.controller";
import { getContractChatInfo } from "./contracts.controller";
import { authRequired } from "../../middleware/auth";
import { requireRole } from "../../middleware/requireRole";

const router = Router();

router.get("/my", authRequired, myContracts);
router.get("/:id", authRequired, getContract);
router.get("/:id/tasks", authRequired, getContractTasks);
router.post("/sendbird-sync-user", authRequired, sendbirdSyncUser);
router.get("/:id/chat", authRequired, getContractChatInfo);
router.patch(
  "/:id/status",
  authRequired,
  requireRole("SUPER_ADMIN"),
  updateContractStatus
);

export default router;
