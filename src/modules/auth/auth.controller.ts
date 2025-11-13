import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../../config/prisma";
import { comparePassword, hashPassword } from "../../utils/hash";
import { env } from "../../config/env";
import { success, fail } from "../../utils/response";

// POST /auth/login
export async function login(req: Request, res: Response) {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user || !user.active) {
    return fail(res, "Invalid credentials", 401);
  }

  const ok = await comparePassword(password, user.passwordHash);
  if (!ok) {
    return fail(res, "Invalid credentials", 401);
  }

  const token = jwt.sign(
    { id: user.id, role: user.role, email: user.email },
    env.jwtSecret,
    { expiresIn: "1d" }
  );

  return success(res, {
    token,
    user: { id: user.id, role: user.role, email: user.email, name: user.name },
  });
}

// POST /auth/register-worker (SUPER_ADMIN only)
export async function registerWorker(req: Request, res: Response) {
  const { name, email, phone, password } = req.body;

  // 1. check if email already exists
  const exists = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true, active: true }
  });

  if (exists) {
    return fail(res, "A user with that email already exists.", 409);
  }

  // 2. create new user
  const pwHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      name,
      email,
      phone,
      passwordHash: pwHash,
      role: "WORKER",
      active: true,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
    },
  });

  return success(res, user, 201);
}


// POST /auth/register-client (SUPER_ADMIN only)
export async function registerClientUser(req: Request, res: Response) {
  const { name, email, phone, password, clientId } = req.body;

  const pwHash = await hashPassword(password);

  const createdUser = await prisma.user.create({
    data: {
      name,
      email,
      phone,
      passwordHash: pwHash,
      role: "CLIENT_VIEWER",
      active: true,
    },
  });

  await prisma.client.update({
    where: { id: clientId },
    data: {
      linkedUserId: createdUser.id,
    },
  });

  return success(
    res,
    {
      id: createdUser.id,
      email: createdUser.email,
      role: createdUser.role,
      clientId,
    },
    201
  );
}
