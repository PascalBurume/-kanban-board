-- CreateTable
CREATE TABLE "TeachThread" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teacherId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeachThread_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TeachThread_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TeachMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "threadId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeachMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "TeachThread" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TeachThread_lessonId_idx" ON "TeachThread"("lessonId");

-- CreateIndex
CREATE UNIQUE INDEX "TeachThread_teacherId_lessonId_key" ON "TeachThread"("teacherId", "lessonId");

-- CreateIndex
CREATE INDEX "TeachMessage_threadId_idx" ON "TeachMessage"("threadId");
