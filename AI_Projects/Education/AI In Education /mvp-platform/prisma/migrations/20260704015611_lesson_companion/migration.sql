-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Lesson" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "moduleId" TEXT,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
    "contentMd" TEXT NOT NULL DEFAULT '',
    "estMinutes" INTEGER NOT NULL DEFAULT 15,
    "sourceRef" TEXT,
    "authorId" TEXT,
    "subjectSlug" TEXT,
    "companionOfId" TEXT,
    CONSTRAINT "Lesson_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Lesson_companionOfId_fkey" FOREIGN KEY ("companionOfId") REFERENCES "Lesson" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Lesson" ("authorId", "contentMd", "estMinutes", "id", "moduleId", "order", "slug", "sourceRef", "status", "subjectSlug", "title") SELECT "authorId", "contentMd", "estMinutes", "id", "moduleId", "order", "slug", "sourceRef", "status", "subjectSlug", "title" FROM "Lesson";
DROP TABLE "Lesson";
ALTER TABLE "new_Lesson" RENAME TO "Lesson";
CREATE UNIQUE INDEX "Lesson_moduleId_slug_key" ON "Lesson"("moduleId", "slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
