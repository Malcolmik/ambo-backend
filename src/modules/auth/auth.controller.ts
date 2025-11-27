import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../../config/prisma";
import { comparePassword, hashPassword } from "../../utils/hash";
import { env } from "../../config/env";
import { success, fail } from "../../utils/response";
import { AuthedRequest } from "../../middleware/auth";

/**
 * POST /api/auth/login
 * Login endpoint for all user types
 */
export async function login(req: Request, res: Response) {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      return fail(res, "Email and password are required", 400);
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user || !user.active) {
      return fail(res, "Invalid credentials", 401);
    }

    // Verify password
    const ok = await comparePassword(password, user.passwordHash);
    if (!ok) {
      return fail(res, "Invalid credentials", 401);
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, role: user.role, email: user.email },
      env.jwtSecret,
      { expiresIn: "7d" }
    );

    return success(res, {
      token,
      user: {
        id: user.id,
        role: user.role,
        email: user.email,
        name: user.name,
      },
    });
  } catch (err) {
    console.error("login error:", err);
    return fail(res, "Login failed", 500);
  }
}

/**
 * POST /api/auth/register-client
 * Client self-registration (public endpoint)
 * Creates a CLIENT_VIEWER_PENDING user that requires admin approval
 */
export async function registerClient(req: Request, res: Response) {
  try {
    const { companyName, contactName, email, phone, password } = req.body;

    // Validate required fields
    if (!companyName || !contactName || !email || !password) {
      return fail(res, "Company name, contact name, email, and password are required", 400);
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return fail(res, "Invalid email format", 400);
    }

    // Validate password length
    if (password.length < 6) {
      return fail(res, "Password must be at least 6 characters", 400);
    }

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      return fail(res, "An account with this email already exists", 409);
    }

    // Check if company name already exists
    const existingClient = await prisma.client.findFirst({
      where: { companyName: companyName.trim() },
    });

    if (existingClient) {
      return fail(res, "A company with this name already exists", 409);
    }

    // Hash password
    const pwHash = await hashPassword(password);

    // Create user and client in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create the CLIENT_VIEWER_PENDING user
      const newUser = await tx.user.create({
        data: {
          name: contactName.trim(),
          email: email.toLowerCase(),
          phone: phone || null,
          passwordHash: pwHash,
          role: "CLIENT_VIEWER_PENDING",
          active: true,
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          active: true,
          createdAt: true,
        },
      });

      // Create the client company
      const newClient = await tx.client.create({
        data: {
          companyName: companyName.trim(),
          contactPerson: contactName.trim(),
          email: email.toLowerCase(),
          phone: phone || null,
          linkedUserId: newUser.id,
        },
        select: {
          id: true,
          companyName: true,
          contactPerson: true,
          email: true,
          phone: true,
          createdAt: true,
        },
      });

      // Audit log (if available)
      try {
        await tx.auditLog.create({
          data: {
            userId: newUser.id,
            actionType: "CLIENT_SELF_REGISTERED",
            entityType: "CLIENT",
            entityId: newClient.id,
            metaJson: {
              companyName: newClient.companyName,
              userEmail: newUser.email,
              userName: newUser.name,
            },
          },
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
        // Don't fail the transaction if audit log fails
      }

      return { user: newUser, client: newClient };
    });

    return success(
      res,
      {
        message: "Registration successful. Your account is pending admin approval.",
        user: result.user,
        client: result.client,
      },
      201
    );
  } catch (err) {
    console.error("registerClient error:", err);
    return fail(res, "Registration failed. Please try again.", 500);
  }
}

/**
 * POST /api/auth/register-worker
 * Create a new WORKER user (SUPER_ADMIN only)
 */
export async function registerWorker(req: AuthedRequest, res: Response) {
  try {
    // Check authentication
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    // Only SUPER_ADMIN can create workers
    if (req.user.role !== "SUPER_ADMIN") {
      return fail(res, "Forbidden: Only SUPER_ADMIN can create workers", 403);
    }

    const { name, email, phone, password } = req.body;

    // Validate required fields
    if (!name || !email || !password) {
      return fail(res, "Name, email, and password are required", 400);
    }

    // Check if email already exists
    const exists = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true, role: true, active: true },
    });

    if (exists) {
      return fail(res, "A user with that email already exists", 409);
    }

    // Hash password
    const pwHash = await hashPassword(password);

    // Create new worker user
    const user = await prisma.user.create({
      data: {
        name,
        email: email.toLowerCase(),
        phone: phone || null,
        passwordHash: pwHash,
        role: "WORKER",
        active: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        active: true,
        createdAt: true,
      },
    });

    // Audit log (if you have it)
    try {
      await prisma.auditLog.create({
        data: {
          userId: req.user.id,
          actionType: "WORKER_CREATED",
          entityType: "USER",
          entityId: user.id,
          metaJson: {
            workerEmail: user.email,
            workerName: user.name,
          },
        },
      });
    } catch (auditErr) {
      console.error("Audit log error:", auditErr);
      // Don't fail the request if audit log fails
    }

    return success(res, user, 201);
  } catch (err) {
    console.error("registerWorker error:", err);
    return fail(res, "Failed to create worker", 500);
  }
}

/**
 * POST /api/auth/register-client-user
 * Create a new CLIENT_VIEWER user linked to an existing client (SUPER_ADMIN only)
 */
export async function registerClientUser(req: AuthedRequest, res: Response) {
  try {
    // Check authentication
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    // Only SUPER_ADMIN can create client users
    if (req.user.role !== "SUPER_ADMIN") {
      return fail(res, "Forbidden: Only SUPER_ADMIN can create client users", 403);
    }

    const { name, email, phone, password, clientId } = req.body;

    // Validate required fields
    if (!name || !email || !password || !clientId) {
      return fail(res, "Name, email, password, and clientId are required", 400);
    }

    // Check if client exists
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, linkedUserId: true, companyName: true },
    });

    if (!client) {
      return fail(res, "Client not found", 404);
    }

    // Check if client already has a linked user
    if (client.linkedUserId) {
      return fail(res, "This client already has a linked user account", 400);
    }

    // Check if email already exists
    const exists = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true },
    });

    if (exists) {
      return fail(res, "A user with that email already exists", 409);
    }

    // Hash password
    const pwHash = await hashPassword(password);

    // Create user and link to client in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create the CLIENT_VIEWER user
      const createdUser = await tx.user.create({
        data: {
          name,
          email: email.toLowerCase(),
          phone: phone || null,
          passwordHash: pwHash,
          role: "CLIENT_VIEWER",
          active: true,
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          active: true,
          createdAt: true,
        },
      });

      // Link the user to the client
      await tx.client.update({
        where: { id: clientId },
        data: { linkedUserId: createdUser.id },
      });

      // Audit log (if you have it)
      try {
        await tx.auditLog.create({
          data: {
            userId: req.user!.id,
            actionType: "CLIENT_USER_CREATED",
            entityType: "USER",
            entityId: createdUser.id,
            metaJson: {
              clientId: clientId,
              clientName: client.companyName,
              userEmail: createdUser.email,
              userName: createdUser.name,
            },
          },
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
        // Don't fail the transaction if audit log fails
      }

      return createdUser;
    });

    return success(res, result, 201);
  } catch (err) {
    console.error("registerClientUser error:", err);
    return fail(res, "Failed to create client user", 500);
  }
}

/**
 * GET /api/auth/me
 * Get current logged-in user details
 */
export async function getCurrentUser(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        active: true,
        createdAt: true,
      },
    });

    if (!user) {
      return fail(res, "User not found", 404);
    }

    return success(res, user);
  } catch (err) {
    console.error("getCurrentUser error:", err);
    return fail(res, "Failed to get user", 500);
  }
}

/**
 * POST /api/auth/change-password
 * Change current user's password
 */
export async function changePassword(req: AuthedRequest, res: Response) {
  try {
    if (!req.user) {
      return fail(res, "Unauthorized", 401);
    }

    const { currentPassword, newPassword } = req.body;

    // Validate required fields
    if (!currentPassword || !newPassword) {
      return fail(res, "Current password and new password are required", 400);
    }

    if (newPassword.length < 6) {
      return fail(res, "New password must be at least 6 characters", 400);
    }

    // Get user with password hash
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, passwordHash: true },
    });

    if (!user) {
      return fail(res, "User not found", 404);
    }

    // Verify current password
    const isValidPassword = await comparePassword(currentPassword, user.passwordHash);
    if (!isValidPassword) {
      return fail(res, "Current password is incorrect", 400);
    }

    // Hash new password
    const newPwHash = await hashPassword(newPassword);

    // Update password
    await prisma.user.update({
      where: { id: req.user.id },
      data: { passwordHash: newPwHash },
    });

    // Audit log (if you have it)
    try {
      await prisma.auditLog.create({
        data: {
          userId: req.user.id,
          actionType: "PASSWORD_CHANGED",
          entityType: "USER",
          entityId: req.user.id,
          metaJson: {},
        },
      });
    } catch (auditErr) {
      console.error("Audit log error:", auditErr);
      // Don't fail the request if audit log fails
    }

    return success(res, { message: "Password changed successfully" });
  } catch (err) {
    console.error("changePassword error:", err);
    return fail(res, "Failed to change password", 500);
  }
}