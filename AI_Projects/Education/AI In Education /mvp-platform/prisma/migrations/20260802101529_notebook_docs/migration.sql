-- CreateTable
CREATE TABLE "NotebookDoc" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Sans titre',
    "subjectSlug" TEXT,
    "contentMd" TEXT NOT NULL DEFAULT '',
    "clientUpdatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "NotebookDoc_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "NotebookDoc_ownerId_updatedAt_idx" ON "NotebookDoc"("ownerId", "updatedAt");
