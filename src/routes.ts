import { Router } from "express";

import authRoutes from "./modules/auth/auth.routes";
import tasksRoutes from "./modules/tasks/tasks.routes";
import clientsRoutes from "./modules/clients/clients.routes";

import paymentsRoutes from "./modules/payments/payments.routes";
// import questionnaireRoutes from "./modules/questionnaire/questionnaire.routes";
// import notificationsRoutes from "./modules/notifications/notifications.routes";

const router = Router();

// existing
router.use("/auth", authRoutes);
router.use("/tasks", tasksRoutes);
router.use("/clients", clientsRoutes);

// new
router.use("/payments", paymentsRoutes);          // /api/payments/initiate, /verify
// router.use("/questionnaire", questionnaireRoutes);
// router.use("/notifications", notificationsRoutes);

export default router;
