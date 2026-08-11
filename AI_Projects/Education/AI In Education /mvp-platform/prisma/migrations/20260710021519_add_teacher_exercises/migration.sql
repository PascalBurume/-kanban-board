-- CreateTable
CREATE TABLE "Exercise" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "authorId" TEXT NOT NULL,
    "subjectSlug" TEXT NOT NULL,
    "classId" TEXT,
    "title" TEXT NOT NULL DEFAULT '',
    "statementMd" TEXT NOT NULL,
    "solutionMd" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Exercise_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Exercise_subjectSlug_fkey" FOREIGN KEY ("subjectSlug") REFERENCES "Subject" ("slug") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Exercise_classId_fkey" FOREIGN KEY ("classId") REFERENCES "ClassGroup" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExerciseLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "exerciseId" TEXT NOT NULL,
    "moduleId" TEXT,
    "lessonId" TEXT,
    CONSTRAINT "ExerciseLink_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExerciseLink_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExerciseLink_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ExerciseLink_moduleId_idx" ON "ExerciseLink"("moduleId");

-- CreateIndex
CREATE INDEX "ExerciseLink_lessonId_idx" ON "ExerciseLink"("lessonId");

-- CreateIndex
CREATE UNIQUE INDEX "ExerciseLink_exerciseId_moduleId_lessonId_key" ON "ExerciseLink"("exerciseId", "moduleId", "lessonId");
