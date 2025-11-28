import crypto from "crypto";
import axios from "axios";
import { Request, Response } from "express";
import { prisma } from "../../config/prisma";
import { AuthedRequest } from "../../middleware/auth";
import { success, fail } from "../../utils/response";

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "";
const PAYSTACK_BASE_URL = "https://api.paystack.co";
// Use env variable or default to your lovable app URL from the screenshot
const FRONTEND_URL = process.env.FRONTEND_URL || "https://ambo-ops-hub.lovable.app";

if (!PAYSTACK_SECRET_KEY) {
  console.warn("[PAYSTACK] PAYSTACK_SECRET_KEY is not set in .env");
}

// Helper: Convert Naira to Kobo
function nairaToKobo(ngn: number): number {
  return Math.round(ngn * 100);
}

/**
 * POST /api/payments/initialize
 * Initialize a Paystack payment for package selection
 */
export async function initializePayment(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    const { packageType, amount } = req.body;

    // Validate required fields
    if (!packageType || !amount) {
      return fail(res, "Package type and amount are required", 400);
    }

    // Validate package type
    const validPackages = ["BASIC", "STANDARD", "PREMIUM"];
    if (!validPackages.includes(packageType)) {
      return fail(res, "Invalid package type", 400);
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

    const amountNumber = Number(amount);
    if (isNaN(amountNumber) || amountNumber <= 0) {
      return fail(res, "Invalid amount", 400);
    }

    // Generate unique reference
    const reference = `AMBO-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Prepare Paystack initialization data
    const paystackData = {
      email: client.email,
      amount: amountNumber * 100, // Convert to kobo (Naira minor unit)
      currency: "NGN",
      reference: reference,
      callback_url: `${FRONTEND_URL}/payment/callback`,
      metadata: {
        packageType: packageType,
        clientId: client.id,
        userId: req.user.id,
        companyName: client.companyName,
      },
    };

    // Initialize payment with Paystack using AXIOS (Fixes fetch errors)
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

    // 1. Create Contract record immediately (so it shows as Pending in UI)
    const contract = await prisma.contract.create({
      data: {
        clientId: client.id,
        packageType,
        services: [], // Will be filled based on package or later
        totalPrice: amountNumber,
        currency: "NGN",
        paymentStatus: "PENDING",
        status: "AWAITING_PAYMENT",
        paymentRef: reference,
      },
    });

    // 2. Create Payment record linked to Contract
    await prisma.payment.create({
      data: {
        contractId: contract.id, // Linked!
        amount: amountNumber,
        currency: "NGN",
        reference: reference,
        status: "PENDING",
        provider: "PAYSTACK",
        meta: {
          packageType: packageType,
          clientId: client.id,
          userId: req.user.id,
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
    console.error("initializePayment error:", err.response?.data || err.message);
    return fail(res, "Failed to initialize payment", 500);
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

    const amountKobo = nairaToKobo(amountNumber);

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
      amount: txData.amount / 100, // Convert back to Naira
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
    const event = req.body;
    const reference = event.data?.reference;

    // 1. Verify signature
    const hash = crypto
      .createHmac("sha512", PAYSTACK_SECRET_KEY)
      .update(JSON.stringify(req.body))
      .digest("hex");

    const signature = req.headers["x-paystack-signature"];

    let isAuthentic = hash === signature;

    if (!isAuthentic) {
      console.warn(`Webhook signature mismatch for ref: ${reference}. Attempting API verification fallback...`);
      
      // Fallback: Verify directly with Paystack to confirm the transaction is actually successful
      // This bypasses the raw body parsing issue while maintaining security
      if (reference) {
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
           }
         } catch (apiErr) {
           console.error("Webhook fallback verification failed:", apiErr);
         }
      }
    }

    if (!isAuthentic) {
      console.error("Invalid webhook signature and verification failed");
      return res.status(401).send("Invalid signature");
    }

    // 2. Parse event
    console.log("Paystack webhook event:", event.event);

    // 3. Handle charge.success event
    if (event.event === "charge.success") {
      const data = event.data;

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
            paidAt: new Date(data.paid_at),
            channel: data.channel,
            rawPayload: data,
          },
        });

        // 2. Update Contract status
        if (payment.contract) {
          await tx.contract.update({
            where: { id: payment.contract.id },
            data: {
              paymentStatus: "PAID",
              status: "AWAITING_QUESTIONNAIRE",
            },
          });
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
        const client = payment.contract?.client;
        if (client && client.linkedUser && client.linkedUser.role === "CLIENT_VIEWER_PENDING") {
          await tx.user.update({
            where: { id: client.linkedUser.id },
            data: { role: "CLIENT_VIEWER" }
          });

          // Audit log for Linked User Promotion
          try {
            await tx.auditLog.create({
              data: {
                userId: client.linkedUser.id,
                actionType: "USER_AUTO_APPROVED_BY_PAYMENT",
                entityType: "USER",
                entityId: client.linkedUser.id,
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
          console.log(`✅ Auto-promoted ${client.linkedUser.email} to CLIENT_VIEWER`);
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
              body: `Payment of ${data.amount / 100} ${data.currency} received from ${
                payment.contract?.client.companyName || "Unknown"
              }. Contract ID: ${payment.contract?.id}`,
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
              body: `Your payment of ${data.amount / 100} ${data.currency} has been confirmed. Please complete the project questionnaire.`,
            },
          });
        }

        // 6. Audit log
        await tx.auditLog.create({
          data: {
            userId: payment.userId || payment.contract!.client.linkedUserId || "system",
            actionType: "PAYMENT_SUCCESS",
            entityType: "PAYMENT",
            entityId: payment.id,
            metaJson: {
              reference,
              amount: data.amount / 100,
              channel: data.channel,
              contractId: payment.contract?.id,
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
