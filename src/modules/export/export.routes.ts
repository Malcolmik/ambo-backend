import { Router } from "express";
import {
  exportClients,
  exportContracts,
  exportTasks,
  exportUsers,
  exportPayments,
  exportQuestionnaires,
  exportAuditLogs,
} from "./export.controller";
import { authRequired } from "../../middleware/auth";
import { requireRole } from "../../middleware/requireRole";

const router = Router();

// All export endpoints require SUPER_ADMIN role
router.get("/clients", authRequired, requireRole("SUPER_ADMIN"), exportClients);
router.get("/contracts", authRequired, requireRole("SUPER_ADMIN"), exportContracts);
router.get("/tasks", authRequired, requireRole("SUPER_ADMIN"), exportTasks);
router.get("/users", authRequired, requireRole("SUPER_ADMIN"), exportUsers);
router.get("/payments", authRequired, requireRole("SUPER_ADMIN"), exportPayments);
router.get("/questionnaires", authRequired, requireRole("SUPER_ADMIN"), exportQuestionnaires);
router.get("/audit-logs", authRequired, requireRole("SUPER_ADMIN"), exportAuditLogs);

export default router;
