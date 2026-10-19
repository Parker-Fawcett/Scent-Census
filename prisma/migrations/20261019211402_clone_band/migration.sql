/*
  Warnings:

  - You are about to drop the column `buysClones` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "buysClones",
ADD COLUMN     "cloneBand" TEXT;
