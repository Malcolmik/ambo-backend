import express from "express";
import cors from "cors";
import routes from "./routes";
import exportRoutes from "./modules/export/export.routes";
import notificationRoutes from "./modules/notifications/notifications.routes";
import analyticsRoutes from "./modules/analytics/analytics.routes";
import searchRoutes from "./modules/search/search.routes";
import reviewRoutes from "./modules/reviews/reviews.routes";
import fileRoutes from "./modules/files/files.routes";

import settingsRoutes from "./modules/settings/settings.routes";
import packagesRoutes from "./modules/packages/packages.routes";
import servicesRoutes from "./modules/services/services.routes";

import { rawBody } from "./middleware/rawBody";
import { paystackWebhook } from "./modules/payments/payments.controller";

const app = express();

// CORS etc.
app.use(cors());

// Paystack webhook – needs raw body, before express.json
app.post("/api/payments/webhook", rawBody, paystackWebhook);

// Normal JSON for everything else
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// New feature routes
app.use("/api/export", exportRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/files", fileRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/packages", packagesRoutes);
app.use("/api/services", servicesRoutes);

// All API routes under /api
app.use("/api", routes);

export default app;
