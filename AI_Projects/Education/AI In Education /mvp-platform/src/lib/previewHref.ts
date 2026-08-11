// The studio's « Vue élève » link. Three call sites build it (the tree studio, the
// full-page editor, and that editor's command menu), so it lives here to keep them
// agreeing on the shape the lesson page and its API expect.
//
// `classId` is what makes the preview honest: compléments are published per class, so
// without it a teacher sees the book lesson but not the additions their own class reads.
export function studentPreviewHref(lessonId: string, classId?: string | null): string {
  const params = new URLSearchParams({ id: lessonId, preview: "1" });
  if (classId) params.set("classId", classId);
  return `/lesson/?${params.toString()}`;
}
