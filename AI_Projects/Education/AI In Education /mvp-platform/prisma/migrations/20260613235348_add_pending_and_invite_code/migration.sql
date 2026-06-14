-- AlterTable
ALTER TABLE "ClassGroup" ADD COLUMN "inviteCode" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "role" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "avatarColor" TEXT,
    "email" TEXT,
    "passwordHash" TEXT,
    "pinHash" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'fr',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "pending" BOOLEAN NOT NULL DEFAULT false,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("avatarColor", "createdAt", "email", "failedAttempts", "firstName", "id", "isActive", "lastLoginAt", "lastName", "locale", "lockedUntil", "mustChangePassword", "passwordHash", "pinHash", "role") SELECT "avatarColor", "createdAt", "email", "failedAttempts", "firstName", "id", "isActive", "lastLoginAt", "lastName", "locale", "lockedUntil", "mustChangePassword", "passwordHash", "pinHash", "role" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ClassGroup_inviteCode_key" ON "ClassGroup"("inviteCode");

