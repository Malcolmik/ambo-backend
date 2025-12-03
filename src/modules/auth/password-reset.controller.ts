import { Response } from "express";
import { prisma } from "../../config/prisma";
import { Request } from "express";
import { success, fail } from "../../utils/response";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { sendPasswordResetEmail } from "../../services/email.service";

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

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
    });

    // Always return success (don't reveal if email exists)
    if (!user) {
      return success(res, {
        message: "If an account exists with that email, a password reset link has been sent",
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenHash = crypto.createHash("sha256").update(resetToken).digest("hex");
    const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour from now

    // Save token to database
    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken: resetTokenHash,
        resetTokenExpiry,
      },
    });

    // Send email with reset link
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    
    try {
      await sendPasswordResetEmail(user.email, user.name, resetUrl);
    } catch (emailError) {
      console.error("Error sending password reset email:", emailError);
      // Don't fail the request - token is still valid
    }

    return success(res, {
      message: "If an account exists with that email, a password reset link has been sent",
    });
  } catch (err: any) {
    console.error("forgotPassword error:", err);
    return fail(res, "Failed to process password reset request", 500);
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

    // Hash the token to match database
    const resetTokenHash = crypto.createHash("sha256").update(token).digest("hex");

    // Find user with valid token
    const user = await prisma.user.findFirst({
      where: {
        resetToken: resetTokenHash,
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
        metaJson: {
          method: "reset_token",
        } as any,
      },
    });

    return success(res, {
      message: "Password reset successfully. You can now log in with your new password.",
    });
  } catch (err: any) {
    console.error("resetPassword error:", err);
    return fail(res, "Failed to reset password", 500);
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

    // Hash the token to match database
    const resetTokenHash = crypto.createHash("sha256").update(token).digest("hex");

    // Find user with valid token
    const user = await prisma.user.findFirst({
      where: {
        resetToken: resetTokenHash,
        resetTokenExpiry: {
          gt: new Date(),
        },
      },
      select: {
        id: true,
        email: true,
        name: true,
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
