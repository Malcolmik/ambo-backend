import crypto from "crypto";
import axios from "axios";
import { Request, Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthedRequest } from "../../middleware/auth";
import { success, fail } from "../../utils/response";

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "";
const PAYSTACK_BASE_URL = "https://api.paystack.co";
const FRONTEND_URL = process.env.FRONTEND_URL || "https://ambo-ops-hub.lovable.app";

// --- CURRENCY SETTINGS ---
// Since the Paystack account is NGN-based, we convert USD to NGN.
// Update this rate as needed.
const EXCHANGE_RATE = 1680; 
const FORCE_CURRENCY = "NGN";

if (!PAYSTACK_SECRET_KEY) {
  console.warn("[PAYSTACK] PAYSTACK_SECRET_KEY is not set in .env");
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

// Helper: Convert Amount to Subunit (Kobo)
function toSubunit(amount: number): number {
  return Math.round(amount * 100);
}

/**
 * POST /api/payments/initialize
 * Initialize a Paystack payment for package selection OR custom services
 */
export async function initializePayment(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    const { packageType, services = [] } = req.body;

    console.log(`Init Payment: User=${req.user.email}, Package=${packageType}`);

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
              console.log(`Adding Add-on: ${service} ($${price})`);
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
    console.log(`Converting $${amountUSD} to ₦${amountNGN} (Rate: ${EXCHANGE_RATE})`);

    // Generate unique reference
    const reference = `AMBO-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Prepare Paystack initialization data (IN NGN)
    const paystackData = {
      email: client.email,
      amount: toSubunit(amountNGN), // Send NGN Kobo
      currency: FORCE_CURRENCY,     // Force "NGN"
      reference: reference,
      callback_url: `${FRONTEND_URL}/payment/callback`,
      metadata: {
        packageType: packageType,
        clientId: client.id,
        userId: req.user.id,
        companyName: client.companyName,
        services: finalServices,
        originalAmountUSD: amountUSD // Store original USD for record
      },
    };

    // Initialize payment with Paystack
    const resp = await axios.post(
      `${PAYSTACK_BASE_URL}/transaction/initialize`,
      paystackData,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const data = resp.data;

    if (!data.status) {
      console.error("Paystack init failed:", data);
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
        provider: "PAYSTACK",
        meta: {
          packageType: packageType,
          clientId: client.id,
          userId: req.user.id,
          originalAmountUSD: amountUSD
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
            originalUSD: amountUSD
          },
        },
      });
    } catch (auditErr) {
      console.error("Audit log error:", auditErr);
    }

    return success(res, {
      authorizationUrl: data.data.authorization_url,
      accessCode: data.data.access_code,
      reference: data.data.reference,
      contractId: contract.id,
    });
  } catch (err: any) {
    const paystackError = err.response?.data;
    console.error("initializePayment error:", JSON.stringify(paystackError || err.message));
    return fail(res, paystackError?.message || "Payment initiation failed", 500);
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
 */
export async function verifyPayment(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) return fail(res, "Unauthorized", 401);
    const { reference } = req.params;

    if (!reference) return fail(res, "Reference required", 400);

    const resp = await axios.get(
      `${PAYSTACK_BASE_URL}/transaction/verify/${reference}`,
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` } }
    );

    const data = resp.data;
    if (!data.status) return fail(res, data.message || "Verification failed", 400);

    const txData = data.data;
    const payment = await prisma.payment.findUnique({
      where: { reference },
      include: { contract: { include: { client: { include: { linkedUser: true } } } }, user: true },
    });

    if (!payment) return fail(res, "Payment not found", 404);

    if (txData.status === "success" && payment.status !== "PAID") {
      await prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { reference },
          data: {
            status: "PAID",
            paidAt: txData.paid_at ? new Date(txData.paid_at) : new Date(),
            channel: txData.channel,
            rawPayload: txData,
          },
        });

        if (payment.contract) {
          await tx.contract.update({
            where: { id: payment.contract.id },
            data: { paymentStatus: "PAID", status: "AWAITING_QUESTIONNAIRE" },
          });
        }

        if (payment.user && payment.user.role === "CLIENT_VIEWER_PENDING") {
          await tx.user.update({ where: { id: payment.user.id }, data: { role: "CLIENT_VIEWER" } });
        }
        
        const client = payment.contract?.client;
        if (client && client.linkedUser && client.linkedUser.role === "CLIENT_VIEWER_PENDING") {
          await tx.user.update({ where: { id: client.linkedUser.id }, data: { role: "CLIENT_VIEWER" } });
        }
      });
    } else {
        // Update status if failed/abandoned
        await prisma.payment.update({
            where: { reference },
            data: { status: txData.status === "success" ? "PAID" : "FAILED" }
        });
    }

    return success(res, {
      status: txData.status,
      amount: txData.amount / 100, 
      reference: txData.reference,
    });
  } catch (err: any) {
    console.error("verifyPayment error:", err.response?.data || err.message);
    return fail(res, "Failed to verify payment", 500);
  }
}

/**
 * POST /api/payments/webhook
 */
export async function paystackWebhook(req: Request, res: Response) {
  try {
    let event = req.body;
    let rawBody = req.body;

    if (Buffer.isBuffer(req.body)) {
      try {
        const bodyString = req.body.toString('utf8');
        event = JSON.parse(bodyString);
        rawBody = req.body; 
      } catch (e) {
        console.error("Webhook Buffer parse error:", e);
      }
    } else if (typeof req.body === 'object') {
        rawBody = JSON.stringify(req.body);
    }

    const reference = event?.data?.reference || event?.reference;
    if (!reference) return res.status(400).send("No reference found");

    const hash = crypto.createHmac("sha512", PAYSTACK_SECRET_KEY).update(rawBody).digest("hex");
    const signature = req.headers["x-paystack-signature"];
    let isAuthentic = hash === signature;

    if (!isAuthentic) {
      console.warn(`Signature mismatch for ${reference}. Checking API...`);
      try {
        const verifyResponse = await axios.get(
          `${PAYSTACK_BASE_URL}/transaction/verify/${reference}`,
          { headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` } }
        );
        if (verifyResponse.data.status && verifyResponse.data.data.status === "success") {
          isAuthentic = true;
          if (!event.data) event.data = verifyResponse.data.data;
          if (!event.event) event.event = "charge.success";
        }
      } catch (e) { console.error("Webhook fallback failed"); }
    }

    if (!isAuthentic) return res.status(401).send("Invalid signature");

    if (event.event === "charge.success") {
      const data = event.data || {}; 
      const payment = await prisma.payment.findUnique({
        where: { reference },
        include: { contract: { include: { client: { include: { linkedUser: true } } } }, user: true },
      });

      if (!payment) return res.status(404).send("Payment not found");
      if (payment.status === "PAID") return res.status(200).send("Already processed");

      await prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { reference },
          data: {
            status: "PAID",
            paidAt: new Date(data.paid_at || new Date()),
            channel: data.channel,
            rawPayload: data,
          },
        });

        let contractClient = payment.contract?.client;
        if (payment.contract) {
          await tx.contract.update({
            where: { id: payment.contract.id },
            data: { paymentStatus: "PAID", status: "AWAITING_QUESTIONNAIRE" },
          });
        } else {
            // Fallback contract linking logic
            const meta: any = data.metadata || payment.meta || {};
            if (meta.clientId && meta.packageType) {
                const services = SERVICE_PRICES[meta.packageType] ? [] : (meta.services || []);
                const newContract = await tx.contract.create({
                    data: {
                        clientId: meta.clientId,
                        packageType: meta.packageType,
                        services, 
                        totalPrice: data.amount ? data.amount / 100 : 0,
                        currency: "NGN",
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

        if (payment.user && payment.user.role === "CLIENT_VIEWER_PENDING") {
          await tx.user.update({ where: { id: payment.user.id }, data: { role: "CLIENT_VIEWER" } });
        }
        if (contractClient && contractClient.linkedUser && contractClient.linkedUser.role === "CLIENT_VIEWER_PENDING") {
          await tx.user.update({ where: { id: contractClient.linkedUser.id }, data: { role: "CLIENT_VIEWER" } });
          
          try {
            await tx.auditLog.create({
              data: {
                userId: contractClient.linkedUser.id,
                actionType: "USER_AUTO_APPROVED_BY_PAYMENT",
                entityType: "USER",
                entityId: contractClient.linkedUser.id,
                metaJson: { paymentRef: reference, action: "Auto-promote" },
              },
            });
          } catch(e) {}
        }
      });
    }

    return res.status(200).send("Webhook received");
  } catch (err: any) {
    console.error("Webhook processing error:", err);
    return res.status(500).send("Webhook processing failed");
  }
}
