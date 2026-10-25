import { describe, expect, it, vi } from "vitest";

// The pipeline modules touch the DOM / workers; only the pure helpers are tested here.
vi.mock("./segmenter", () => ({ segment: vi.fn() }));
vi.mock("./render", () => ({ exportImage: vi.fn() }));
vi.mock("./files", () => ({ baseName: (n: string) => n, decodeImage: vi.fn() }));
const { outputName, outputWidth } = await import("./batch");

describe("batch helpers", () => {
  it("names outputs after the input, uniquely, never like the original", () => {
    const used = new Set<string>();
    expect(outputName("shoe.jpg", "png", used)).toBe("shoe-libreroom.png");
    expect(outputName("shoe.png", "png", used)).toBe("shoe-libreroom-2.png");
    expect(outputName("SHOE.webp", "png", used)).toBe("SHOE-libreroom-3.png");
    expect(outputName("bag", "jpeg", used)).toBe("bag-libreroom.jpg");
    expect(outputName(".png", "webp", used)).toBe("image-libreroom.webp");
  });
  it("limits the longest side without upscaling", () => {
    expect(outputWidth(4000, 3000, 2000)).toBe(2000);
    expect(outputWidth(3000, 4000, 2000)).toBe(1500);
    expect(outputWidth(800, 600, 2000)).toBe(800);
    expect(outputWidth(800, 600, null)).toBe(800);
  });
});
