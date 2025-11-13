import { Request, Response } from "express";
import { prisma } from "../../config/prisma";
import { success } from "../../utils/response";

// GET /users
export async function listUsers(req: Request, res: Response) {
  const users = await prisma.user.findMany({
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
  return success(res, users);
}

// PATCH /users/:id
export async function updateUser(req: Request, res: Response) {
  const { id } = req.params;
  const { active, name, phone } = req.body;

  const updated = await prisma.user.update({
    where: { id },
    data: {
      ...(active !== undefined ? { active } : {}),
      ...(name ? { name } : {}),
      ...(phone ? { phone } : {}),
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
    },
  });

  return success(res, updated);
}
