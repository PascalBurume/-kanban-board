-- CreateTable
CREATE TABLE "DeletedLesson" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lessonId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subjectSlug" TEXT,
    "moduleId" TEXT,
    "moduleTitle" TEXT,
    "authorId" TEXT,
    "wasPublished" BOOLEAN NOT NULL DEFAULT false,
    "extraCount" INTEGER NOT NULL DEFAULT 0,
    "deletedById" TEXT NOT NULL,
    "deletedByName" TEXT NOT NULL,
    "deletedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payloadJson" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "DeletedLesson_lessonId_key" ON "DeletedLesson"("lessonId");

-- CreateIndex
CREATE INDEX "DeletedLesson_authorId_deletedAt_idx" ON "DeletedLesson"("authorId", "deletedAt");
