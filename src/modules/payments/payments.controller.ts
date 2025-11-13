import axios from "axios";
import { Request, Response } from "express";
import { AuthedRequest } from "../../middleware/auth";
import { success, fail } from "../../utils/response";

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "";
const PAYSTACK_BASE_URL = "https://api.paystack.co";

if (!PAYSTACK_SECRET_KEY) {
  console.warn("[PAYSTACK] PAYSTACK_SECRET_KEY is not set in .env");
}

// helper
function nairaToKobo(ngn: number) {
  return Math.round(ngn * 100);
}

// POST /api/payments/initiate
export async function initiatePayment(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) return fail(res, "Unauthorized", 401);

    // --- DEBUGGING: Log incoming request body ---
    console.log("initiatePayment body:", req.body);
    // -------------------------------------------

    const { packageType, services = [], totalPrice, currency = "NGN" } = req.body;

    // Normalise totalPrice to a number for robust validation and calculation
    const amountNumber = Number(totalPrice);

    // Validation: Check if it's a valid number and greater than zero
    if (!amountNumber || isNaN(amountNumber) || amountNumber <= 0) {
      return fail(res, "Invalid totalPrice", 400);
    }

    const amountKobo = nairaToKobo(amountNumber);

    const resp = await axios.post(
      `${PAYSTACK_BASE_URL}/transaction/initialize`,
      {
        email: req.user.email,
        amount: amountKobo,
        currency,
        metadata: {
          userId: req.user.id,
          packageType,
          services,
          // Use the validated number here
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

    return success(res, {
      authorization_url: data.data.authorization_url,
      reference: data.data.reference,
    });
  } catch (err: any) {
    console.error("initiatePayment error:", err.response?.data || err.message);
    return fail(res, "Payment initiation failed", 500);
  }
}

// POST /api/payments/verify  (simple stub for now)
export async function verifyPayment(req: AuthedRequest, res: Response) {
  return fail(res, "Not implemented yet", 501);
}

// POST /api/payments/webhook  (simple stub so app.ts compiles)
export async function paystackWebhook(req: Request, res: Response) {
  console.log("Paystack webhook hit");
  return res.status(200).send("ok");
}