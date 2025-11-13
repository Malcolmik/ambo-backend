import bcrypt from "bcryptjs";
import { env } from "../config/env";

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, env.bcryptRounds);
}

export async function comparePassword(plain: string, hashed: string) {
  return bcrypt.compare(plain, hashed);
}
