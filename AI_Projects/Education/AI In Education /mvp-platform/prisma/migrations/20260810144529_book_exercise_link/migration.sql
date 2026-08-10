-- CreateTable
CREATE TABLE "BookExerciseLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "exId" INTEGER NOT NULL,
    "lessonId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BookExerciseLink_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "BookExerciseLink_lessonId_idx" ON "BookExerciseLink"("lessonId");

-- CreateIndex
CREATE UNIQUE INDEX "BookExerciseLink_exId_lessonId_key" ON "BookExerciseLink"("exId", "lessonId");
