-- CreateTable
CREATE TABLE "BookExerciseFix" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "exId" INTEGER NOT NULL,
    "statementMd" TEXT NOT NULL,
    "solutionMd" TEXT NOT NULL DEFAULT '',
    "editedById" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "BookExerciseFix_exId_key" ON "BookExerciseFix"("exId");
