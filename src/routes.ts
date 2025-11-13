import { Router } from "express";

import authRoutes from "./modules/auth/auth.routes";
import usersRoutes from "./modules/users/users.routes";
import tasksRoutes from "./modules/tasks/tasks.routes";
import clientsRoutes from "./modules/clients/clients.routes";
import commentsRoutes from "./modules/comments/comments.routes";
import activityRoutes from "./modules/activity/activity.routes";

import paymentsRoutes from "./modules/payments/payments.routes";
import questionnaireRoutes from "./modules/questionnaire/questionnaire.routes";
import notificationsRoutes from "./modules/notifications/notifications.routes";
import contractsRoutes from "./modules/contracts/contracts.routes";

const router = Router();

// Auth & Users
router.use("/auth", authRoutes);
router.use("/users", usersRoutes);

// Core entities
router.use("/tasks", tasksRoutes);
router.use("/clients", clientsRoutes);
router.use("/tasks", commentsRoutes); // /api/tasks/:taskId/comments
router.use("/activity", activityRoutes);

// Payment & Contract Flow
router.use("/payments", paymentsRoutes);
router.use("/questionnaire", questionnaireRoutes);
router.use("/contracts", contractsRoutes);
router.use("/notifications", notificationsRoutes);

export default router;
