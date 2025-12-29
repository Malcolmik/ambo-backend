import app from "./app";
import { env } from "./config/env";

// Existing route imports
import authRouter from "./modules/auth/auth.routes";
import usersRouter from "./modules/users/users.routes";
import clientsRouter from "./modules/clients/clients.routes";
import tasksRouter from "./modules/tasks/tasks.routes";
import contractsRouter from "./modules/contracts/contracts.routes";
import paymentsRouter from "./modules/payments/payments.routes";
import questionnaireRoutes from "./modules/questionnaire/questionnaire.routes";
import chatRoutes from "./routes/chat.routes";

// V2 Route Imports
import jobsRouter from "./modules/jobs/jobs.routes";
import workerRouter from "./modules/worker/worker.routes";
import settingsRouter from "./modules/settings/settings.routes";

// ============================================
// REGISTER ROUTES
// ============================================

// Core authentication & user management
app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);

// Client & Contract management
app.use("/api/clients", clientsRouter);
app.use("/api/contracts", contractsRouter);

// Task management (existing)
app.use("/api/tasks", tasksRouter);

// Payment & Questionnaire
app.use("/api/payments", paymentsRouter);
app.use("/api/questionnaire", questionnaireRoutes);

// Chat system
app.use("/api/chats", chatRoutes);

// ============================================
// V2 ROUTES
// ============================================

// Job Broadcasting System
app.use("/api/jobs", jobsRouter);

// Worker Dashboard & Earnings
app.use("/api/worker", workerRouter);

// Platform Settings, Admin Management, Worker Management
app.use("/api/settings", settingsRouter);

// ============================================
// START SERVER
// ============================================

app.listen(env.port, () => {
  console.log(`
╔════════════════════════════════════════════════════════╗
║                    AMBO Backend V2                      ║
╠════════════════════════════════════════════════════════╣
║  API running on port ${env.port}                             ║
║                                                          ║
║  V2 Features:                                            ║
║  ✓ Job Broadcasting System (/api/jobs)                  ║
║  ✓ Worker Dashboard & Earnings (/api/worker)            ║
║  ✓ Platform Settings (/api/settings)                    ║
║  ✓ Admin Role Support                                    ║
║  ✓ Worker Payment Tracking                               ║
╚════════════════════════════════════════════════════════╝
  `);
});
