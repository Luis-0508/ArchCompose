import { writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { chooseImages } from "./fixtures";

/**
 * Renders the documentation screenshots in docs/screenshots as WebP. Skipped unless
 * SCREENSHOTS=1, because it overwrites tracked files:
 *
 *   SCREENSHOTS=1 npx playwright test screenshots
 */
test.skip(!process.env.SCREENSHOTS, "Set SCREENSHOTS=1 to regenerate documentation screenshots.");

const OUT = "docs/screenshots";

/** Captures the page and encodes it as WebP with the browser's own encoder. */
async function capture(page: Page, name: string) {
  const png = (await page.screenshot()).toString("base64");
  const webp = await page.evaluate(async (data) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext("2d")!.drawImage(image, 0, 0);
    return canvas.toDataURL("image/webp", 0.9).split(",")[1];
  }, png);
  writeFileSync(`${OUT}/${name}.webp`, Buffer.from(webp, "base64"));
}

async function populate(page: Page) {
  await page.goto("/");
  await chooseImages(page, () => page.getByRole("button", { name: "Import render" }).click(), [
    { name: "courtyard-dusk.png", kind: "render" },
  ]);
  await page.getByRole("tab", { name: "Library" }).click();
  await chooseImages(
    page,
    () => page.getByRole("button", { name: "Import images" }).first().click(),
    [
      { name: "person-walking.png", kind: "person" },
      { name: "plane-tree.png", kind: "tree" },
    ],
  );
  await page.getByRole("button", { name: /plane-tree\.png/ }).dblclick();
  await page.getByLabel("X", { exact: true }).fill("1080");
  await page.getByLabel("X", { exact: true }).press("Enter");
  await page.getByLabel("Y", { exact: true }).fill("420");
  await page.getByLabel("Y", { exact: true }).press("Enter");
  await page.getByRole("button", { name: /person-walking\.png/ }).dblclick();
  await page.getByLabel("X", { exact: true }).fill("620");
  await page.getByLabel("X", { exact: true }).press("Enter");
  await page.getByLabel("Y", { exact: true }).fill("560");
  await page.getByLabel("Y", { exact: true }).press("Enter");
  await page.getByRole("tab", { name: /Layers/ }).click();
  await page.getByRole("radio", { name: "Horizon guide" }).click();
  const stage = (await page.getByTestId(/viewport-compose/).boundingBox())!;
  const paper = await page
    .getByTestId(/viewport-compose/)
    .locator("div")
    .first()
    .boundingBox();
  await page.mouse.click(
    stage.x + stage.width / 2,
    (paper ?? stage).y + (paper ?? stage).height * 0.6,
  );
  await page.getByRole("radio", { name: "Select and move" }).click();
  await page.getByRole("option", { name: /person-walking/ }).click();
}

test("documentation screenshots", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1600, height: 960 });
  await populate(page);
  await page.mouse.move(800, 500);
  await capture(page, "compose");

  await page.keyboard.press("Control+2");
  await chooseImages(
    page,
    () => page.getByRole("button", { name: "Import drawing files" }).last().click(),
    [{ name: "ground-floor-plan.png", kind: "plan" }],
  );
  await page.getByLabel("Level").first().fill("Ground floor");
  await page.getByLabel("Level").first().press("Enter");
  await page.getByLabel("Revision description").fill("Issued for design review");
  await page.getByRole("button", { name: "Add revision" }).click();
  // Annotate the imported plan: a red redline cloud and a room label.
  const sheet = (await page.locator("[data-testid^='sheet-']").boundingBox())!;
  const at = (fx: number, fy: number) => ({
    x: sheet.x + sheet.width * fx,
    y: sheet.y + sheet.height * fy,
  });
  await page.getByRole("button", { name: "Colour: Red" }).click();
  await page.getByLabel("Width", { exact: true }).first().fill("0.7");
  await page.getByLabel("Width", { exact: true }).first().press("Enter");
  await page.keyboard.press("c");
  let from = at(0.62, 0.36);
  let to = at(0.7, 0.36);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  await page.getByLabel("Text size").fill("14");
  await page.getByLabel("Text size").press("Enter");
  await page.keyboard.press("t");
  from = at(0.21, 0.36);
  await page.mouse.click(from.x, from.y);
  await page.getByRole("textbox", { name: "New text" }).fill("Living room");
  await page.keyboard.press("Enter");
  await page.keyboard.press("l");
  from = at(0.56, 0.42);
  to = at(0.46, 0.5);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.press("v");
  await page.keyboard.press("Escape");
  await page.mouse.move(800, 500);
  await capture(page, "drawings");

  await page.keyboard.press("Control+3");
  await page.getByRole("button", { name: "New A1 board" }).click();
  const paper = (await page.getByTestId("board-paper").boundingBox())!;
  const cell = (col: number, row: number) => ({
    x: paper.x + (paper.width * (20 + col * 132 + 40)) / 841,
    y: paper.y + (paper.height * (20 + row * 134 + 40)) / 594,
  });
  // Title across the top-left cell.
  let p = cell(0, 0);
  await page.mouse.click(p.x, p.y);
  await page.getByLabel("Content").selectOption("text");
  await page.getByLabel("Style").selectOption("title");
  await page.getByLabel("Text", { exact: true }).fill("Courtyard\nHousing");
  await page.getByLabel("Text", { exact: true }).press("Control+Enter");
  await page.getByLabel("Columns").first().fill("2");
  await page.getByLabel("Columns").first().press("Enter");
  // Render across the middle.
  p = cell(2, 0);
  await page.mouse.click(p.x, p.y);
  await page.getByLabel("Content").selectOption("asset");
  await page.getByLabel("Columns").first().fill("4");
  await page.getByLabel("Columns").first().press("Enter");
  await page.getByLabel("Rows").first().fill("2");
  await page.getByLabel("Rows").first().press("Enter");
  // Plan bottom-left.
  p = cell(0, 2);
  await page.mouse.click(p.x, p.y);
  await page.getByLabel("Content").selectOption("drawing");
  await page.getByLabel("Columns").first().fill("3");
  await page.getByLabel("Columns").first().press("Enter");
  await page.getByLabel("Rows").first().fill("2");
  await page.getByLabel("Rows").first().press("Enter");
  await expect(page.getByTestId("board-issues")).toBeVisible();
  await capture(page, "boards");

  await page.setViewportSize({ width: 1100, height: 700 });
  await page.keyboard.press("Control+1");
  await page.waitForTimeout(200);
  await capture(page, "compose-small-window");
});
