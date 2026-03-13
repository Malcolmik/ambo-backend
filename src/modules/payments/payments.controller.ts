import crypto from "crypto";
import axios from "axios";
import { Request, Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthedRequest } from "../../middleware/auth";
import { success, fail } from "../../utils/response";

// --- XOROPAY CONFIGURATION ---
const XOROPAY_SECRET_KEY = process.env.XOROPAY_SECRET_KEY || "";
const XOROPAY_BASE_URL = "https://api.xoropay.com";
const XOROPAY_PROCESSOR = process.env.XOROPAY_PROCESSOR || "kora";
const FRONTEND_URL = process.env.FRONTEND_URL || "https://ambo-ops-hub.lovable.app";

// --- CURRENCY SETTINGS ---
// Since the account is NGN-based, we convert USD to NGN.
// Update this rate as needed.
const EXCHANGE_RATE = 1680; 
const FORCE_CURRENCY = "NGN";

if (!XOROPAY_SECRET_KEY) {
  console.warn("[XOROPAY] XOROPAY_SECRET_KEY is not set in .env");
}

// --- CONFIGURATION: Service & Package Definitions ---

// 1. Individual Service Prices (USD)
const SERVICE_PRICES: Record<string, number> = {
  // --- DOCX / Original Keys ---
  "Content writing.": 150,
  "Social Media Management": 750,
  "P-P-C Marketing (SMM & GOOGLE)": 151.5,
  "Content Marketing": 150,
  "Branding": 150,
  "Content Creativity and Production for all SM platforms.": 525,
  "Email Marketing": 150,
  "S.E.M (Search Engine Marketing)": 153,
  "Affiliate Marketing": 162,
  "Influencer Marketing": 171,
  "Web Design": 600,
  "Commercial Shoots/ Promotions": 600,
  "Community Management": 175,
  "Competitive Market Analysis.": 150,

  // --- Frontend / Clean Keys ---
  "Content Writing": 150,
  "PPC Marketing": 151.5,
  "Content Creativity & Production": 525,
  "SEM (Search Engine Marketing)": 153,
  "Commercial Shoots/Promotions": 600,
  "Competitive Market Analysis": 150,
  
  // --- Normalized / Fallbacks ---
  "Search Engine Marketing": 153,
  "Content creativity and Production for all SM platforms": 525,
  "Commercial shoots and Promotions": 600,
  "Competitive Marketing Analysis": 150,
  "Account Management (CRM)": 0,
  "Online Marketing Consultations": 0
};

// 2. Package Prices (USD)
const PACKAGE_PRICES: Record<string, number> = {
  "AMBO CLASSIC": 2249,
  "AMBO DELUXE": 2959,
  "AMBO PREMIUM": 3876
};

// 3. Package Contents
const PACKAGE_DEFINITIONS: Record<string, string[]> = {
  "AMBO CLASSIC": [
    "PPC Marketing", "Email Marketing", "Content Marketing", "Account Management (CRM)", 
    "Influencer Marketing", "Content creativity and Production for all SM platforms", 
    "Branding", "Online Marketing Consultations", "Search Engine Marketing"
  ],
  "AMBO DELUXE": [
    "PPC Marketing", "Email Marketing", "Content Marketing", "Account Management (CRM)", 
    "Influencer Marketing", "Content creativity and Production for all SM platforms", 
    "Branding", "Online Marketing Consultations", "Search Engine Marketing",
    "Affiliate Marketing", "Community Management", "Web Design"
  ],
  "AMBO PREMIUM": [
    "PPC Marketing", "Email Marketing", "Content Marketing", "Account Management (CRM)", 
    "Influencer Marketing", "Content creativity and Production for all SM platforms", 
    "Branding", "Online Marketing Consultations", "Search Engine Marketing",
    "Affiliate Marketing", "Community Management", "Web Design",
    "Commercial shoots and Promotions", "Competitive Marketing Analysis"
  ]
};

/**
 * POST /api/payments/initialize
 * Initialize a Xoropay payment for package selection OR custom services
 * 
 * CHANGES FROM PAYSTACK:
 * - Uses Xoropay endpoint (POST /api/v1/initiate instead of /transaction/initialize)
 * - NO toSubunit() conversion - amounts are in actual currency units (NGN, not kobo)
 * - Requires customer object with name field
 * - Includes processor, notification_url, and narration fields
 * - Response uses checkout_url instead of authorization_url
 */
export async function initializePayment(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    const { packageType, services = [] } = req.body;

    console.log(`[Xoropay] Init Payment: User=${req.user.email}, Package=${packageType}`);

    // Validate package type
    const validPackages = ["AMBO CLASSIC", "AMBO DELUXE", "AMBO PREMIUM", "CUSTOM"];
    if (!validPackages.includes(packageType)) {
      return fail(res, "Invalid package type.", 400);
    }

    // Get client information
    const client = await prisma.client.findFirst({
      where: { linkedUserId: req.user.id },
      select: { id: true, companyName: true, email: true },
    });

    if (!client) {
      return fail(res, "Client not found. Please contact support.", 404);
    }

    // --- CALCULATE USD AMOUNT ---
    let amountUSD = 0;
    let finalServices: string[] = [];

    if (packageType === "CUSTOM") {
      // 1. Pure Custom Package (Just the selected services)
      if (!Array.isArray(services) || services.length === 0) {
        return fail(res, "For CUSTOM packages, select at least one service", 400);
      }
      finalServices = services;
      for (const service of services) {
        const price = SERVICE_PRICES[service];
        if (price !== undefined) amountUSD += price;
      }
    } else {
      // 2. Standard Package + Optional Add-ons (Hybrid)
      amountUSD = PACKAGE_PRICES[packageType] || 0;
      const defaultServices = PACKAGE_DEFINITIONS[packageType] || [];
      
      // Calculate Add-ons: Iterate through selected services
      if (Array.isArray(services) && services.length > 0) {
        for (const service of services) {
          // Only add price if this service is NOT already included in the base package
          if (!defaultServices.includes(service)) {
            const price = SERVICE_PRICES[service];
            if (price !== undefined) {
              console.log(`[Xoropay] Adding Add-on: ${service} ($${price})`);
              amountUSD += price;
            }
          }
        }
      }

      // Merge base services + add-ons for the final record
      const serviceSet = new Set([...defaultServices, ...services]);
      finalServices = Array.from(serviceSet);
    }

    if (amountUSD <= 0) {
      return fail(res, "Calculated amount is invalid.", 400);
    }

    // --- CONVERT TO NGN ---
    const amountNGN = amountUSD * EXCHANGE_RATE;
    console.log(`[Xoropay] Converting $${amountUSD} to ₦${amountNGN} (Rate: ${EXCHANGE_RATE})`);

    // Generate unique reference
    const reference = `AMBO-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Prepare Xoropay initialization data
    // IMPORTANT: Xoropay amounts are in actual currency units, NOT subunits (kobo)
    const xoropayData = {
      customer: {
        email: client.email,
        name: client.companyName
      },
      amount: amountNGN,  // Actual currency units (₦), NOT kobo
      currency: FORCE_CURRENCY,  // "NGN"
      reference: reference,
      processor: XOROPAY_PROCESSOR,  // "kora", "pstk", or "fltw"
      redirect_url: `${FRONTEND_URL}/payment/callback`,
      notification_url: `${process.env.BACKEND_URL || "http://localhost:3000"}/api/payments/webhook`,
      narration: `Payment for ${packageType} package`,
      metadata: {
        packageType: packageType,
        clientId: client.id,
        userId: req.user.id,
        companyName: client.companyName,
        services: finalServices,
        originalAmountUSD: amountUSD // Store original USD for record
      },
    };

    // Initialize payment with Xoropay
    const resp = await axios.post(
      `${XOROPAY_BASE_URL}/api/v1/initiate`,
      xoropayData,
      {
        headers: {
          Authorization: `Bearer ${XOROPAY_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const data = resp.data;

    if (!data.success) {
      console.error("[Xoropay] Init failed:", data);
      return fail(res, data.message || "Failed to initialize payment", 400);
    }

    // 1. Create Contract (Storing NGN value for consistency with payment)
    const contract = await prisma.contract.create({
      data: {
        clientId: client.id,
        packageType,
        services: finalServices, 
        totalPrice: amountNGN, // Storing NGN value
        currency: FORCE_CURRENCY,
        paymentStatus: "PENDING",
        status: "AWAITING_PAYMENT",
        paymentRef: reference,
      },
    });

    // 2. Create Payment record
    await prisma.payment.create({
      data: {
        contractId: contract.id,
        amount: amountNGN,
        currency: FORCE_CURRENCY,
        reference: reference,
        status: "PENDING",
        provider: "XOROPAY",  // Changed from "PAYSTACK"
        meta: {
          packageType: packageType,
          clientId: client.id,
          userId: req.user.id,
          originalAmountUSD: amountUSD,
          processor: XOROPAY_PROCESSOR
        },
      },
    });

    // 3. Audit log
    try {
      await prisma.auditLog.create({
        data: {
          userId: req.user.id,
          actionType: "PAYMENT_INITIATED",
          entityType: "CONTRACT",
          entityId: contract.id,
          metaJson: {
            reference,
            amount: amountNGN,
            currency: FORCE_CURRENCY,
            originalUSD: amountUSD,
            provider: "XOROPAY"
          },
        },
      });
    } catch (auditErr) {
      console.error("[Xoropay] Audit log error:", auditErr);
    }

    return success(res, {
      authorizationUrl: data.data.checkout_url,  // Map checkout_url to authorizationUrl for frontend compatibility
      reference: data.data.reference,
      processor: data.data.processor,
      contractId: contract.id,
    });
  } catch (err: any) {
    const xoropayError = err.response?.data;
    console.error("[Xoropay] initializePayment error:", JSON.stringify(xoropayError || err.message));
    return fail(res, xoropayError?.message || "Payment initiation failed", 500);
  }
}

/**
 * POST /api/payments/initiate (Legacy)
 */
export async function initiatePayment(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) return fail(res, "Unauthorized", 401);
    return fail(res, "Please use the new payment flow", 400); 
  } catch (err) {
    return fail(res, "Legacy endpoint error", 500);
  }
}

/**
 * GET /api/payments/verify/:reference
 * 
 * NOTE: Xoropay verification can be done via webhook.
 * This endpoint is kept for compatibility but may not be actively used
 * with Xoropay's webhook-first model.
 */
export async function verifyPayment(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) return fail(res, "Unauthorized", 401);
    const { reference } = req.params;

    if (!reference) return fail(res, "Reference required", 400);

    // Check payment status from database (populated by webhook)
    const payment = await prisma.payment.findUnique({
      where: { reference },
      include: { contract: { include: { client: { include: { linkedUser: true } } } }, user: true },
    });

    if (!payment) return fail(res, "Payment not found", 404);

    // Return current payment status from database
    return success(res, {
      status: payment.status === "PAID" ? "success" : payment.status === "FAILED" ? "failed" : "pending",
      amount: payment.amount,
      reference: payment.reference,
      provider: "XOROPAY"
    });
  } catch (err: any) {
    console.error("[Xoropay] verifyPayment error:", err.message);
    return fail(res, "Failed to verify payment", 500);
  }
}

/**
 * POST /api/payments/webhook
 * 
 * CHANGES FROM PAYSTACK:
 * - Signature header changed from x-paystack-signature to x-xoropay-signature
 * - Hash algorithm changed from SHA-512 to SHA-256
 * - Uses XOROPAY_SECRET_KEY for webhook signature verification
 * - Event name changed from "charge.success" to "payment.successful"
 * - Also handles "payment.failed" event
 * - 30-second timeout with up to 5 exponential backoff retries (Xoropay handles this)
 */
export async function paystackWebhook(req: Request, res: Response) {
  try {
    let event = req.body;
    let rawBody = req.body;

    // Handle raw body for signature verification
    if (Buffer.isBuffer(req.body)) {
      try {
        rawBody = req.body; 
        const bodyString = req.body.toString('utf8');
        event = JSON.parse(bodyString);
      } catch (e) {
        console.error("[Xoropay] Webhook Buffer parse error:", e);
      }
    } else if (typeof req.body === 'object') {
      rawBody = JSON.stringify(req.body);
    }

    const reference = event?.data?.reference || event?.reference;
    if (!reference) {
      console.warn("[Xoropay] Webhook received without reference");
      return res.status(400).send("No reference found");
    }

    // --- SIGNATURE VERIFICATION (Xoropay) ---
    // Xoropay uses HMAC SHA-256 with x-xoropay-signature header
    const signature = req.headers["x-xoropay-signature"] as string;
    
    if (!signature) {
      console.warn(`[Xoropay] Missing x-xoropay-signature header for ${reference}`);
      return res.status(401).send("Invalid signature");
    }

    const expectedSignature = crypto
      .createHmac("sha256", XOROPAY_SECRET_KEY)
      .update(rawBody)
      .digest("hex");

    // Use timing-safe comparison to prevent timing attacks
    let isAuthentic = false;
    try {
      isAuthentic = crypto.timingSafeEqual(
        Buffer.from(expectedSignature),
        Buffer.from(signature)
      );
    } catch (e) {
      // Buffers are not equal length or other comparison error
      isAuthentic = false;
    }

    if (!isAuthentic) {
      console.warn(`[Xoropay] Signature mismatch for ${reference}. Expected: ${expectedSignature}, Got: ${signature}`);
      return res.status(401).send("Invalid signature");
    }

    // --- HANDLE PAYMENT.SUCCESSFUL EVENT ---
    if (event.event === "payment.successful") {
      console.log(`[Xoropay] Processing payment.successful for ${reference}`);
      
      const data = event.data || {}; 
      const payment = await prisma.payment.findUnique({
        where: { reference },
        include: { contract: { include: { client: { include: { linkedUser: true } } } }, user: true },
      });

      if (!payment) {
        console.warn(`[Xoropay] Payment not found: ${reference}`);
        return res.status(404).send("Payment not found");
      }

      if (payment.status === "PAID") {
        console.log(`[Xoropay] Payment already processed: ${reference}`);
        return res.status(200).send("Already processed");
      }

      // Verify amount matches
      if (payment.amount !== data.amount) {
        console.warn(`[Xoropay] Amount mismatch for ${reference}. Expected: ${payment.amount}, Got: ${data.amount}`);
        return res.status(400).send("Amount mismatch");
      }

      await prisma.$transaction(async (tx) => {
        // Update payment status
        await tx.payment.update({
          where: { reference },
          data: {
            status: "PAID",
            paidAt: data.completed_at ? new Date(data.completed_at) : new Date(),
            channel: data.processor,  // Store processor name
            rawPayload: data,
          },
        });

        let contractClient = payment.contract?.client;
        
        // Update contract status
        if (payment.contract) {
          await tx.contract.update({
            where: { id: payment.contract.id },
            data: { paymentStatus: "PAID", status: "AWAITING_QUESTIONNAIRE" },
          });
        } else {
          // Fallback contract linking logic
          const meta: any = data.metadata || payment.meta || {};
          if (meta.clientId && meta.packageType) {
            const services = meta.services || [];
            const newContract = await tx.contract.create({
              data: {
                clientId: meta.clientId,
                packageType: meta.packageType,
                services, 
                totalPrice: data.amount,
                currency: data.currency || "NGN",
                paymentStatus: "PAID",
                status: "AWAITING_QUESTIONNAIRE",
                paymentRef: reference,
              },
              include: { client: { include: { linkedUser: true } } }
            });
            contractClient = newContract.client;
            await tx.payment.update({ where: { id: payment.id }, data: { contractId: newContract.id } });
          }
        }

        // Promote user if pending
        if (payment.user && payment.user.role === "CLIENT_VIEWER_PENDING") {
          await tx.user.update({ where: { id: payment.user.id }, data: { role: "CLIENT_VIEWER" } });
        }

        // Promote linked user if pending
        if (contractClient && contractClient.linkedUser && contractClient.linkedUser.role === "CLIENT_VIEWER_PENDING") {
          await tx.user.update({ where: { id: contractClient.linkedUser.id }, data: { role: "CLIENT_VIEWER" } });
          
          try {
            await tx.auditLog.create({
              data: {
                userId: contractClient.linkedUser.id,
                actionType: "USER_AUTO_APPROVED_BY_PAYMENT",
                entityType: "USER",
                entityId: contractClient.linkedUser.id,
                metaJson: { paymentRef: reference, provider: "XOROPAY", action: "Auto-promote" },
              },
            });
          } catch(e) {
            console.error("[Xoropay] Audit log error for promotion:", e);
          }
        }
      });

      console.log(`[Xoropay] Payment ${reference} completed successfully`);
      return res.status(200).send("Webhook received");
    }

    // --- HANDLE PAYMENT.FAILED EVENT ---
    if (event.event === "payment.failed") {
      console.log(`[Xoropay] Processing payment.failed for ${reference}`);
      
      const payment = await prisma.payment.findUnique({
        where: { reference }
      });

      if (!payment) {
        console.warn(`[Xoropay] Failed payment not found: ${reference}`);
        return res.status(404).send("Payment not found");
      }

      await prisma.payment.update({
        where: { reference },
        data: {
          status: "FAILED",
          rawPayload: event.data || {}
        }
      });

      console.log(`[Xoropay] Payment ${reference} marked as failed`);
      return res.status(200).send("Webhook received");
    }

    // Unknown event
    console.log(`[Xoropay] Unknown event received: ${event.event}`);
    return res.status(200).send("Event received");

  } catch (err: any) {
    console.error("[Xoropay] Webhook processing error:", err);
    return res.status(500).send("Webhook processing failed");
  }
}