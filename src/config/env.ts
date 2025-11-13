import dotenv from "dotenv";
dotenv.config();

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is missing in .env");
}

export const env = {
  port: process.env.PORT || 4000,
  jwtSecret: process.env.JWT_SECRET as string,
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 12),
  nodeEnv: process.env.NODE_ENV || "development",

  seedAdminName: process.env.SEED_ADMIN_NAME || "Admin User",
  seedAdminEmail: process.env.SEED_ADMIN_EMAIL || "admin@example.com",
  seedAdminPhone: process.env.SEED_ADMIN_PHONE || "+0000000000",
  seedAdminPassword: process.env.SEED_ADMIN_PASSWORD || "adminpassword",
};
