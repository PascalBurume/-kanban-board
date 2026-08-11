-- CreateTable
CREATE TABLE "ModuleLock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "classId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "lockedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ModuleLock_classId_fkey" FOREIGN KEY ("classId") REFERENCES "ClassGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ModuleLock_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ModuleLock_classId_moduleId_key" ON "ModuleLock"("classId", "moduleId");
