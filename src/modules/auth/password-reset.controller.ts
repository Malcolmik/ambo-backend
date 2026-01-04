import { Response } from "express";
import { prisma } from "../../config/prisma";
import { Request } from "express";
import { success, fail } from "../../utils/response";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { sendPasswordResetEmail } from "../services/email.service";

/**
 * POST /api/auth/forgot-password
 * Request a password reset email
 */
export async function forgotPassword(req: Request, res: Response) {
  try {
    const { email } = req.body;

    if (!email) {
      return fail(res, "Email is required", 400);
    }

    const user = await prisma.user.findUnique({
      where: { email }
    });

    // Always return success to avoid revealing if email exists
    if (!user) {
      return success(res, { message: "If an account exists, you'll receive a reset email" });
    }

    // Generate reset token (plain, not hashed)
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour

    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken: resetToken,
        resetTokenExpiry: resetTokenExpiry
      }
    });

    // LOGGING CODE 
    const frontendUrl = process.env.FRONTEND_URL || "https://ambo-dash.lovable.app";
    const resetLink = `${frontendUrl}/reset-password?token=${resetToken}`;

    console.log("═══════════════════════════════════════");
    console.log("🔐 PASSWORD RESET REQUEST");
    console.log("📧 Email:", email);
    console.log("🔗 Reset Link:", resetLink);
    console.log("⏰ Expires:", resetTokenExpiry.toISOString());
    console.log("═══════════════════════════════════════");

    // Try to send email (this might fail silently)
    try {
      await sendPasswordResetEmail(email, user.name, resetLink);
      console.log("✅ Email sent successfully");
    } catch (emailError) {
      console.error("❌ Email failed:", emailError);
      // Continue anyway - user can see link in logs for testing
    }

    return success(res, { 
      message: "If an account exists, you'll receive a reset email"
    });
  } catch (err: any) {
    console.error("forgotPassword error:", err);
    return fail(res, "Failed to process request", 500);
  }
}

/**
 * POST /api/auth/verify-reset-token
 * Verify if a reset token is valid (before showing password form)
 */
export async function verifyResetToken(req: Request, res: Response) {
  try {
    const { token } = req.body;

    if (!token) {
      return fail(res, "Token is required", 400);
    }

    // Find user with valid token (plain token, no hashing)
    const user = await prisma.user.findFirst({
      where: {
        resetToken: token,
        resetTokenExpiry: {
          gt: new Date(),
        },
      },
    });

    if (!user) {
      return fail(res, "Invalid or expired reset token", 400);
    }

    return success(res, {
      valid: true,
      email: user.email,
      name: user.name,
    });
  } catch (err: any) {
    console.error("verifyResetToken error:", err);
    return fail(res, "Failed to verify token", 500);
  }
}

/**
 * POST /api/auth/reset-password
 * Reset password using token
 */
export async function resetPassword(req: Request, res: Response) {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return fail(res, "Token and new password are required", 400);
    }

    if (newPassword.length < 8) {
      return fail(res, "Password must be at least 8 characters", 400);
    }

    // Find user with valid token (plain token, no hashing)
    const user = await prisma.user.findFirst({
      where: {
        resetToken: token,
        resetTokenExpiry: {
          gt: new Date(), // Token not expired
        },
      },
    });

    if (!user) {
      return fail(res, "Invalid or expired reset token", 400);
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password and clear reset token
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hashedPassword,
        resetToken: null,
        resetTokenExpiry: null,
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        actionType: "PASSWORD_RESET",
        entityType: "USER",
        entityId: user.id,
        metaJson: JSON.parse(JSON.stringify({
          method: "reset_token",
        })),
      },
    });

    console.log("✅ Password reset successful for:", user.email);

    return success(res, {
      message: "Password reset successfully. You can now log in with your new password.",
    });
  } catch (err: any) {
    console.error("resetPassword error:", err);
    return fail(res, "Failed to reset password", 500);
  }
}
