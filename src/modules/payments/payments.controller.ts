import crypto from "crypto";
import axios from "axios";
import { Request, Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthedRequest } from "../../middleware/auth";
import { success, fail } from "../../utils/response";

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "";
const PAYSTACK_BASE_URL = "https://api.paystack.co";
const FRONTEND_URL = process.env.FRONTEND_URL || "https://ambo-ops-hub.lovable.app";

if (!PAYSTACK_SECRET_KEY) {
  console.warn("[PAYSTACK] PAYSTACK_SECRET_KEY is not set in .env");
}

// --- CONFIGURATION: Service & Package Definitions ---

// 1. Individual Service Prices (USD)
// expanded to include variations from both DOCX and Frontend
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

  // --- Frontend / Clean Keys (Likely what Lovable sends) ---
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
    "PPC Marketing",
    "Email Marketing",
    "Content Marketing",
    "Account Management (CRM)",
    "Influencer Marketing",
    "Content creativity and Production for all SM platforms",
    "Branding",
    "Online Marketing Consultations",
    "Search Engine Marketing"
  ],
  "AMBO DELUXE": [
    "PPC Marketing", "Email Marketing", "Content Marketing", "Account Management (CRM)", 
    "Influencer Marketing", "Content creativity and Production for all SM platforms", 
    "Branding", "Online Marketing Consultations", "Search Engine Marketing",
    "Affiliate Marketing",
    "Community Management",
    "Web Design"
  ],
  "AMBO PREMIUM": [
    "PPC Marketing", "Email Marketing", "Content Marketing", "Account Management (CRM)", 
    "Influencer Marketing", "Content creativity and Production for all SM platforms", 
    "Branding", "Online Marketing Consultations", "Search Engine Marketing",
    "Affiliate Marketing", "Community Management", "Web Design",
    "Commercial shoots and Promotions",
    "Competitive Marketing Analysis"
  ]
};

// Helper: Convert Amount to Subunit (Kobo for NGN, Cents for USD)
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

    const { packageType, currency, services = [] } = req.body;
    // Default to USD per new requirement, but allow override if needed
    const txCurrency = currency || "USD"; 

    console.log(`Init Payment: User=${req.user.email}, Package=${packageType}, Services=${services.length}`);

    // Validate package type
    const validPackages = ["AMBO CLASSIC", "AMBO DELUXE", "AMBO PREMIUM", "CUSTOM"];
    if (!validPackages.includes(packageType)) {
      console.warn(`Invalid Package Type received: ${packageType}`);
      return fail(res, "Invalid package type. Must be AMBO CLASSIC, DELUXE, PREMIUM or CUSTOM.", 400);
    }

    // Get client information
    const client = await prisma.client.findFirst({
      where: { linkedUserId: req.user.id },
      select: {
        id: true,
        companyName: true,
        email: true,
      },
    });

    if (!client) {
      return fail(res, "Client not found. Please contact support.", 404);
    }

    // --- CALCULATE AMOUNT SERVER-SIDE ---
    let amountNumber = 0;
    let finalServices: string[] = [];

    if (packageType === "CUSTOM") {
      // For CUSTOM, we sum up the individual service prices
      if (!Array.isArray(services) || services.length === 0) {
        return fail(res, "For CUSTOM packages, at least one service must be selected", 400);
      }
      
      finalServices = services;
      
      // Calculate total
      for (const service of services) {
        const price = SERVICE_PRICES[service];
        if (price !== undefined) {
          amountNumber += price;
        } else {
          console.warn(`Warning: Service '${service}' has no price defined in backend.`);
          // We continue, assuming 0 price, or you could throw error.
        }
      }
    } else {
      // For Standard Packages
      amountNumber = PACKAGE_PRICES[packageType] || 0;
      
      // Merge package services + any extra add-ons sent
      const defaultServices = PACKAGE_DEFINITIONS[packageType] || [];
      // Use Set to remove duplicates
      const serviceSet = new Set([...defaultServices, ...services]);
      finalServices = Array.from(serviceSet);
    }

    console.log(`Calculated Total: ${amountNumber} ${txCurrency}`);

    if (amountNumber <= 0) {
      return fail(res, "Calculated amount is invalid (0). Please check your selection.", 400);
    }

    // Generate unique reference
    const reference = `AMBO-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Prepare Paystack initialization data
    const paystackData = {
      email: client.email,
      amount: toSubunit(amountNumber), 
      currency: txCurrency,
      reference: reference,
      callback_url: `${FRONTEND_URL}/payment/callback`,
      metadata: {
        packageType: packageType,
        clientId: client.id,
        userId: req.user.id,
        companyName: client.companyName,
        services: finalServices, // Store the full list in metadata
      },
    };

    // Initialize payment with Paystack using AXIOS
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
      console.error("Paystack initialization failed:", data);
      return fail(res, data.message || "Failed to initialize payment", 400);
    }

    // 1. Create Contract record immediately
    const contract = await prisma.contract.create({
      data: {
        clientId: client.id,
        packageType,
        services: finalServices, 
        totalPrice: amountNumber,
        currency: txCurrency,
        paymentStatus: "PENDING",
        status: "AWAITING_PAYMENT",
        paymentRef: reference,
      },
    });

    // 2. Create Payment record linked to Contract
    await prisma.payment.create({
      data: {
        contractId: contract.id,
        amount: amountNumber,
        currency: txCurrency,
        reference: reference,
        status: "PENDING",
        provider: "PAYSTACK",
        meta: {
          packageType: packageType,
          clientId: client.id,
          userId: req.user.id,
          services: finalServices
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
            amount: amountNumber,
            packageType,
            currency: txCurrency
          },
        },
      });
    } catch (auditErr) {
      console.error("Audit log error:", auditErr);
    }

    // Return Paystack authorization URL and reference
    return success(res, {
      authorizationUrl: data.data.authorization_url,
      accessCode: data.data.access_code,
      reference: data.data.reference,
      contractId: contract.id,
    });
  } catch (err: any) {
    // Detailed error logging for Paystack issues
    const paystackError = err.response?.data;
    console.error("initializePayment error details:", JSON.stringify(paystackError || err.message));
    
    // Return specific message if from Paystack
    const msg = paystackError?.message || "Payment initiation failed";
    return fail(res, msg, 500);
  }
}

/**
 * POST /api/payments/initiate
 * Initializes payment with Paystack and creates Contract + Payment records
 * (Legacy endpoint - kept for backward compatibility)
 */
export async function initiatePayment(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) return fail(res, "Unauthorized", 401);

    const { 
      clientId,
      packageType, 
      services = [], 
      totalPrice, 
      currency = "NGN" 
    } = req.body;

    // Validate inputs
    const amountNumber = Number(totalPrice);
    if (!amountNumber || isNaN(amountNumber) || amountNumber <= 0) {
      return fail(res, "Invalid totalPrice", 400);
    }

    if (!clientId) {
      return fail(res, "clientId is required", 400);
    }

    // Verify client exists
    const client = await prisma.client.findUnique({
      where: { id: clientId },
    });

    if (!client) {
      return fail(res, "Client not found", 404);
    }

    const amountKobo = toSubunit(amountNumber);

    // Call Paystack Initialize API
    const resp = await axios.post(
      `${PAYSTACK_BASE_URL}/transaction/initialize`,
      {
        email: req.user.email,
        amount: amountKobo,
        currency,
        metadata: {
          userId: req.user.id,
          clientId,
          packageType,
          services: JSON.stringify(services),
          totalPrice: amountNumber,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const data = resp.data;
    if (!data.status) {
      console.error("Paystack init error:", data);
      return fail(res, "Failed to initialize payment", 502);
    }

    const reference = data.data.reference;

    // Create Contract record
    const contract = await prisma.contract.create({
      data: {
        clientId,
        packageType,
        services,
        totalPrice: amountNumber,
        currency,
        paymentStatus: "PENDING",
        status: "AWAITING_PAYMENT",
        paymentRef: reference,
      },
    });

    // Create Payment record
    await prisma.payment.create({
      data: {
        provider: "PAYSTACK",
        reference,
        amount: amountKobo,
        currency,
        status: "PENDING",
        customerEmail: req.user.email,
        userId: req.user.id,
        contractId: contract.id,
        meta: {
          packageType,
          services,
        },
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        actionType: "PAYMENT_INITIATED",
        entityType: "CONTRACT",
        entityId: contract.id,
        metaJson: {
          reference,
          amount: amountNumber,
          packageType,
        },
      },
    });

    return success(res, {
      authorization_url: data.data.authorization_url,
      reference: reference,
      contractId: contract.id,
    });
  } catch (err: any) {
    console.error("initiatePayment error:", err.response?.data || err.message);
    return fail(res, "Payment initiation failed", 500);
  }
}

/**
 * GET /api/payments/verify/:reference
 * Verify a payment status
 */
export async function verifyPayment(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    const { reference } = req.params;

    if (!reference) {
      return fail(res, "Payment reference is required", 400);
    }

    // Verify with Paystack using AXIOS
    const resp = await axios.get(
      `${PAYSTACK_BASE_URL}/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        },
      }
    );

    const data = resp.data;

    if (!data.status) {
      return fail(res, data.message || "Failed to verify payment", 400);
    }

    const txData = data.data;

    // Find payment record
    const payment = await prisma.payment.findUnique({
      where: { reference },
      include: { 
        contract: { 
          include: { client: { include: { linkedUser: true } } } 
        },
        user: true,
      },
    });

    if (!payment) {
      return fail(res, "Payment record not found", 404);
    }

    if (txData.status === "success" && payment.status !== "PAID") {
      // PERFORM FULL UPDATE (Similar to Webhook)
      await prisma.$transaction(async (tx) => {
        // 1. Update Payment
        await tx.payment.update({
          where: { reference },
          data: {
            status: "PAID",
            paidAt: txData.paid_at ? new Date(txData.paid_at) : new Date(),
            channel: txData.channel,
            rawPayload: txData,
          },
        });

        // 2. Update Contract
        if (payment.contract) {
          await tx.contract.update({
            where: { id: payment.contract.id },
            data: {
              paymentStatus: "PAID",
              status: "AWAITING_QUESTIONNAIRE",
            },
          });
        }

        // 3. Promote Users
        if (payment.user && payment.user.role === "CLIENT_VIEWER_PENDING") {
          await tx.user.update({
            where: { id: payment.user.id },
            data: { role: "CLIENT_VIEWER" },
          });
        }
        
        const client = payment.contract?.client;
        if (client && client.linkedUser && client.linkedUser.role === "CLIENT_VIEWER_PENDING") {
          await tx.user.update({
            where: { id: client.linkedUser.id },
            data: { role: "CLIENT_VIEWER" }
          });
        }
      });
    } else {
      // Just update status if failed or already paid
      await prisma.payment.update({
        where: { reference },
        data: {
          status: txData.status === "success" ? "PAID" : "FAILED",
          paidAt: txData.paid_at ? new Date(txData.paid_at) : null,
          channel: txData.channel,
          rawPayload: txData,
        },
      });
    }

    return success(res, {
      status: txData.status,
      amount: txData.amount / 100, // Convert back to major unit
      paidAt: txData.paid_at,
      reference: txData.reference,
    });
  } catch (err: any) {
    console.error("verifyPayment error:", err.response?.data || err.message);
    return fail(res, "Failed to verify payment", 500);
  }
}

/**
 * POST /api/payments/webhook
 * Paystack webhook handler for payment events
 */
export async function paystackWebhook(req: Request, res: Response) {
  try {
    let event = req.body;
    let rawBody = req.body;

    // --- FIX: Handle Buffer Body correctly (detected from logs) ---
    if (Buffer.isBuffer(req.body)) {
      console.log("Paystack Webhook: Received Buffer body, converting...");
      try {
        // Parse the buffer to get the event object
        const bodyString = req.body.toString('utf8');
        event = JSON.parse(bodyString);
        // For signature, we MUST use the buffer directly, NOT stringify it
        rawBody = req.body; 
      } catch (e) {
        console.error("Paystack Webhook: Failed to parse Buffer body:", e);
      }
    } else if (typeof req.body === 'object') {
        // Fallback for standard express json parser
        rawBody = JSON.stringify(req.body);
    }

    // Extensive Debug Logging
    console.log("--- WEBHOOK START ---");
    
    // Robust reference extraction
    const reference = event?.data?.reference || event?.reference;

    if (!reference) {
      console.warn("Paystack Webhook: No reference found in payload");
      return res.status(400).send("No reference found");
    }

    // 2. Verify signature
    const hash = crypto
      .createHmac("sha512", PAYSTACK_SECRET_KEY)
      .update(rawBody) 
      .digest("hex");

    const signature = req.headers["x-paystack-signature"];
    let isAuthentic = hash === signature;

    // If signature fails, try API fallback
    if (!isAuthentic) {
      console.warn(`Webhook signature mismatch for ref: ${reference}. Checking API...`);
      
      try {
        const verifyResponse = await axios.get(
          `${PAYSTACK_BASE_URL}/transaction/verify/${reference}`,
          {
            headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
          }
        );
        
        const verifyData = verifyResponse.data;
        if (verifyData.status && verifyData.data.status === "success") {
          console.log(`API verification confirmed success for ref: ${reference}`);
          isAuthentic = true;
          // IMPORTANT: Update event data from the API source of truth
          if (!event.data) event.data = verifyData.data;
          // Ensure event type is set so logic below triggers
          if (!event.event) event.event = "charge.success";
        }
      } catch (apiErr) {
        console.error("Webhook fallback verification failed:", apiErr);
      }
    }

    if (!isAuthentic) {
      console.error("Invalid webhook signature and verification failed");
      return res.status(401).send("Invalid signature");
    }

    // 3. Handle charge.success event
    const eventType = event.event;
    console.log("Processing event type:", eventType);
    
    if (eventType === "charge.success") {
      const data = event.data || {}; 

      // Find payment record
      const payment = await prisma.payment.findUnique({
        where: { reference },
        include: { 
          contract: { 
            include: { client: { include: { linkedUser: true } } } 
          },
          user: true,
        },
      });

      if (!payment) {
        console.error(`Payment not found for reference: ${reference}`);
        return res.status(404).send("Payment not found");
      }

      // Check if already processed
      if (payment.status === "PAID") {
        console.log(`Payment ${reference} already processed`);
        return res.status(200).send("Already processed");
      }

      // Begin transaction
      await prisma.$transaction(async (tx) => {
        // 1. Update Payment to PAID
        await tx.payment.update({
          where: { reference },
          data: {
            status: "PAID",
            paidAt: new Date(data.paid_at || new Date()), 
            channel: data.channel || 'unknown',
            rawPayload: data,
          },
        });

        // 2. Update Contract status
        let contractClient = payment.contract?.client;
        
        if (payment.contract) {
          await tx.contract.update({
            where: { id: payment.contract.id },
            data: {
              paymentStatus: "PAID",
              status: "AWAITING_QUESTIONNAIRE",
            },
          });
        } else {
            // Scenario B: No contract linked (Safety fallback)
            const meta: any = data.metadata || payment.meta || {};
            if (meta.clientId && meta.packageType) {
                console.log("Creating/Linking contract in webhook for:", reference);
                const services = PACKAGE_DEFINITIONS[meta.packageType] || meta.services || [];
                
                const newContract = await tx.contract.create({
                    data: {
                        clientId: meta.clientId,
                        packageType: meta.packageType,
                        services: services, 
                        totalPrice: data.amount ? data.amount / 100 : 0,
                        currency: data.currency || "NGN",
                        paymentStatus: "PAID",
                        status: "AWAITING_QUESTIONNAIRE",
                        paymentRef: reference,
                    },
                    include: { client: { include: { linkedUser: true } } }
                });
                contractClient = newContract.client;
                
                // Link payment
                await tx.payment.update({
                    where: { id: payment.id },
                    data: { contractId: newContract.id }
                });
            }
        }

        // 3. Promote user role from CLIENT_VIEWER_PENDING to CLIENT_VIEWER
        
        // 3a. Handle the User who initiated the payment
        if (payment.user && payment.user.role === "CLIENT_VIEWER_PENDING") {
          await tx.user.update({
            where: { id: payment.user.id },
            data: { role: "CLIENT_VIEWER" },
          });
        }

        // 3b. Handle the Linked User on the Client Account (Auto-promotion)
        if (contractClient && contractClient.linkedUser && contractClient.linkedUser.role === "CLIENT_VIEWER_PENDING") {
          await tx.user.update({
            where: { id: contractClient.linkedUser.id },
            data: { role: "CLIENT_VIEWER" }
          });

          // Audit log for Linked User Promotion
          try {
            await tx.auditLog.create({
              data: {
                userId: contractClient.linkedUser.id,
                actionType: "USER_AUTO_APPROVED_BY_PAYMENT",
                entityType: "USER",
                entityId: contractClient.linkedUser.id,
                metaJson: {
                  paymentReference: reference,
                  oldRole: "CLIENT_VIEWER_PENDING",
                  newRole: "CLIENT_VIEWER",
                },
              },
            });
          } catch (auditErr) {
            console.error("Audit log error:", auditErr);
          }
          console.log(`✅ Auto-promoted ${contractClient.linkedUser.email} to CLIENT_VIEWER`);
        }

        // 4. Create notification for SUPER_ADMIN
        const superAdmins = await tx.user.findMany({
          where: { role: "SUPER_ADMIN", active: true },
          select: { id: true },
        });

        for (const admin of superAdmins) {
          await tx.notification.create({
            data: {
              userId: admin.id,
              type: "PAYMENT_CONFIRMED",
              title: "New Payment Received",
              body: `Payment of ${data.amount ? data.amount / 100 : 'Unknown'} ${data.currency || 'NGN'} received from ${
                contractClient?.companyName || "Unknown"
              }. Contract ID: ${payment.contractId || "New"}`,
            },
          });
        }

        // 5. Create notification for client user
        if (payment.user) {
          await tx.notification.create({
            data: {
              userId: payment.user.id,
              type: "PAYMENT_CONFIRMED",
              title: "Payment Successful",
              body: `Your payment has been confirmed. Please complete the project questionnaire.`,
            },
          });
        }

        // 6. Audit log
        await tx.auditLog.create({
          data: {
            userId: payment.userId || contractClient?.linkedUserId || "system",
            actionType: "PAYMENT_SUCCESS",
            entityType: "PAYMENT",
            entityId: payment.id,
            metaJson: {
              reference,
              amount: data.amount ? data.amount / 100 : 0,
              channel: data.channel,
              contractId: payment.contractId,
            },
          },
        });
      });

      console.log(`✅ Payment ${reference} processed successfully`);
    }

    return res.status(200).send("Webhook received");
  } catch (err: any) {
    console.error("Webhook processing error:", err);
    return res.status(500).send("Webhook processing failed");
  }
}
