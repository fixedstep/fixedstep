import { expect, type Page } from "@playwright/test";

/**
 * The page doesn't scroll sideways: the document is no wider than the viewport. On failure the
 * message lists the first elements that stick out past the right edge, so the next regression
 * points at its cause.
 */
export async function expectNoPageScrollX(page: Page): Promise<void> {
  const { scrollWidth, clientWidth, offenders } = await page.evaluate(() => {
    const limit = document.documentElement.clientWidth;
    const offenders = [...document.querySelectorAll("body *")]
      .filter((el) => el.getBoundingClientRect().right > limit)
      .slice(0, 5)
      .map(
        (el) =>
          `${el.tagName.toLowerCase()}${el.className ? `.${String(el.className).trim().replace(/\s+/g, ".")}` : ""}`,
      );
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      offenders,
    };
  });
  expect(
    scrollWidth,
    `page scrolls sideways; elements past the right edge: ${offenders.join(", ") || "none found"}`,
  ).toBeLessThanOrEqual(clientWidth);
}
