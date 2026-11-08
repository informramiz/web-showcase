import { describe, expect, it } from "vitest";
import { baseContentType, cleanFileName, MAX_NAME_LENGTH } from "@/features/attachments/domain/limits";
import { contentDisposition } from "@/features/attachments/server/content-disposition";

describe("cleanFileName", () => {
  it("drops paths, control characters and quotes and caps length", () => {
    expect(cleanFileName("C:\\Users\\me\\report.pdf")).toBe("report.pdf");
    expect(cleanFileName('../../a\u0000b".txt')).toBe("ab.txt");
    expect(cleanFileName("  spaced.txt  ")).toBe("spaced.txt");
    expect(cleanFileName("x".repeat(300))).toHaveLength(MAX_NAME_LENGTH);
    expect(cleanFileName("dir/")).toBe("");
  });
});

describe("baseContentType", () => {
  it("strips parameters and lowercases", () => {
    expect(baseContentType("Text/Plain; charset=UTF-8")).toBe("text/plain");
    expect(baseContentType("")).toBe("");
  });
});

describe("contentDisposition", () => {
  it("always forces a download and keeps UTF-8 names", () => {
    expect(contentDisposition("plan.pdf")).toBe(`attachment; filename="plan.pdf"; filename*=UTF-8''plan.pdf`);
    expect(contentDisposition("résumé (1).pdf")).toBe(
      `attachment; filename="r_sum_ (1).pdf"; filename*=UTF-8''r%C3%A9sum%C3%A9%20%281%29.pdf`,
    );
    expect(contentDisposition('a"b\\c')).toContain('filename="a_b_c"');
  });
});
