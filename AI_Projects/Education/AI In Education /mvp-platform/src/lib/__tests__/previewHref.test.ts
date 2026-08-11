import { describe, it, expect } from "vitest";
import { studentPreviewHref } from "../previewHref";

describe("studentPreviewHref", () => {
  it("points at the lesson page and marks the intent", () => {
    expect(studentPreviewHref("les_1")).toBe("/lesson/?id=les_1&preview=1");
  });

  it("carries the class so the preview shows that class's compléments", () => {
    expect(studentPreviewHref("les_1", "cls_9")).toBe("/lesson/?id=les_1&preview=1&classId=cls_9");
  });

  it("omits the class when there is none — admins browse without one", () => {
    for (const empty of [null, undefined, ""]) {
      expect(studentPreviewHref("les_1", empty)).not.toContain("classId");
    }
  });

  it("keeps the trailing slash the app's routes are configured with", () => {
    // Next is on trailingSlash; /lesson?id=… redirects and drops nothing, but the
    // redirect costs a round trip and shows up as a flash of the wrong page.
    expect(studentPreviewHref("les_1")).toMatch(/^\/lesson\/\?/);
  });

  it("escapes ids rather than splicing them into the query", () => {
    expect(studentPreviewHref("a&b=c")).toBe("/lesson/?id=a%26b%3Dc&preview=1");
  });
});
