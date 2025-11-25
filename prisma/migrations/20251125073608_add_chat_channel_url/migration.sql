/*
  Warnings:

  - You are about to alter the column `chatChannelUrl` on the `Contract` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(191)`.

*/
-- AlterTable
ALTER TABLE "Contract" ALTER COLUMN "chatChannelUrl" SET DATA TYPE VARCHAR(191);
