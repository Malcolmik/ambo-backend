import express from "express";
import cors from "cors";
import routes from "./routes";
import exportRoutes from "./modules/export/export.routes";

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

app.use("/api/export", exportRoutes);


// All API routes under /api
app.use("/api", routes);

export default app;
