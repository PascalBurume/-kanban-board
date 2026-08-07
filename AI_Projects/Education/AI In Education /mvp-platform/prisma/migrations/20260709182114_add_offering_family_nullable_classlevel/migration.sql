-- AlterTable
ALTER TABLE "Subject" ADD COLUMN "family" TEXT;

-- CreateTable
CREATE TABLE "Offering" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "level" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "subjectSlug" TEXT NOT NULL,
    CONSTRAINT "Offering_subjectSlug_fkey" FOREIGN KEY ("subjectSlug") REFERENCES "Subject" ("slug") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Module" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subjectSlug" TEXT NOT NULL,
    "classLevel" TEXT,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Module_subjectSlug_fkey" FOREIGN KEY ("subjectSlug") REFERENCES "Subject" ("slug") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Module" ("classLevel", "id", "order", "subjectSlug", "title") SELECT "classLevel", "id", "order", "subjectSlug", "title" FROM "Module";
DROP TABLE "Module";
ALTER TABLE "new_Module" RENAME TO "Module";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Offering_level_field_subjectSlug_key" ON "Offering"("level", "field", "subjectSlug");
