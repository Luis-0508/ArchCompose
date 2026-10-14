import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { chooseImages } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("radiogroup", { name: "Workspace" })).toBeVisible();
  await page.keyboard.press("Control+2");
  await page.getByRole("button", { name: "New blank sheet" }).click();
});

const sheet = (page: Page) => page.locator("[data-testid^='sheet-']");
const elements = (page: Page) => sheet(page).locator("[data-element-id]");

/** Maps fractions of the sheet's on-screen box to page coordinates. */
async function sheetBox(page: Page) {
  const box = (await sheet(page).boundingBox())!;
  return (fx: number, fy: number) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });
}

type Pt = { x: number; y: number };

async function drag(page: Page, from: Pt, to: Pt) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2 + 5, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
}

async function click(page: Page, p: Pt) {
  await page.mouse.click(p.x, p.y);
}

async function drawEveryTool(page: Page) {
  const at = await sheetBox(page);
  await page.keyboard.press("p");
  await drag(page, at(0.1, 0.1), at(0.25, 0.25));
  await page.keyboard.press("r");
  await drag(page, at(0.35, 0.1), at(0.55, 0.3));
  await page.keyboard.press("c");
  await drag(page, at(0.75, 0.2), at(0.85, 0.2));
  await page.keyboard.press("l");
  await drag(page, at(0.1, 0.5), at(0.9, 0.5));
  await page.keyboard.press("y");
  await click(page, at(0.1, 0.7));
  await click(page, at(0.2, 0.85));
  await click(page, at(0.3, 0.7));
  await page.keyboard.press("Enter");
  await page.keyboard.press("t");
  await click(page, at(0.6, 0.8));
  await page.getByRole("textbox", { name: "New text" }).fill("Living room");
  await page.keyboard.press("Enter");
}

test("creates a blank sheet without an image", async ({ page }) => {
  await expect(sheet(page)).toHaveAttribute("viewBox", "0 0 420 297");
  await expect(page.getByTestId("tb-format")).toContainText("A3 landscape, 420 × 297 mm, 1:100");
  await expect(page.getByRole("radiogroup", { name: "Drawing tools" })).toBeVisible();
  await expect(sheet(page).locator("image")).toHaveCount(0);
  await expect(elements(page)).toHaveCount(0);
});

test("draws with every tool and undoes and redoes", async ({ page }) => {
  await drawEveryTool(page);
  await expect(elements(page)).toHaveCount(6);
  await expect(sheet(page).locator("text")).toHaveText("Living room");

  await page.keyboard.press("Control+z");
  await expect(elements(page)).toHaveCount(5);
  await page.keyboard.press("Control+Shift+z");
  await expect(elements(page)).toHaveCount(6);
});

test("selects, moves, scales, deletes and erases", async ({ page }) => {
  await drawEveryTool(page);
  const at = await sheetBox(page);

  // Select the rectangle by its left edge and move it.
  await page.keyboard.press("v");
  const rect = sheet(page).locator("rect[data-element-id]");
  const before = (await rect.boundingBox())!;
  await drag(page, at(0.35, 0.2), at(0.4, 0.25));
  await expect(page.getByTestId("element-selection")).toBeVisible();
  const moved = (await rect.boundingBox())!;
  expect(moved.x).toBeGreaterThan(before.x + 5);
  await expect(page.getByRole("button", { name: "Undo move element" })).toBeVisible();

  // Drag the bottom-right handle outwards to scale it.
  const selection = (await page.getByTestId("element-selection").boundingBox())!;
  await drag(
    page,
    { x: selection.x + selection.width, y: selection.y + selection.height },
    { x: selection.x + selection.width + 40, y: selection.y + selection.height + 30 },
  );
  const scaled = (await rect.boundingBox())!;
  expect(scaled.width).toBeGreaterThan(moved.width + 20);
  await expect(page.getByRole("button", { name: "Undo scale element" })).toBeVisible();

  await page.keyboard.press("Delete");
  await expect(elements(page)).toHaveCount(5);
  await page.keyboard.press("Control+z");
  await expect(elements(page)).toHaveCount(6);

  // Erasing across the long line cuts it into two strokes.
  await page.keyboard.press("e");
  await drag(page, at(0.5, 0.45), at(0.5, 0.55));
  await expect(elements(page)).toHaveCount(7);
  await page.keyboard.press("Control+z");
  await expect(elements(page)).toHaveCount(6);
});

test("edits text in place", async ({ page }) => {
  await drawEveryTool(page);
  await page.keyboard.press("v");
  const label = sheet(page).locator("text");
  await label.dblclick();
  const editor = page.getByRole("textbox", { name: "Edit text" });
  await editor.fill("Kitchen");
  await editor.press("Enter");
  await expect(label).toHaveText("Kitchen");
  await expect(page.getByRole("button", { name: "Undo edit text" })).toBeVisible();
});

test("changes paper, grid, rulers and stroke settings", async ({ page }) => {
  await page.getByLabel("Paper", { exact: true }).selectOption("A1");
  await page.getByRole("radio", { name: "Portrait" }).click();
  await expect(sheet(page)).toHaveAttribute("viewBox", "0 0 594 841");
  await page.getByLabel("Paper", { exact: true }).selectOption("custom");
  const width = page.getByLabel("Width", { exact: true }).last();
  await width.fill("1000");
  await width.press("Enter");
  await expect(page.getByTestId("tb-format")).toContainText("Custom, 1000 × 841 mm");

  await page.getByRole("radio", { name: "Hide rulers" }).click();
  await expect(page.locator("canvas")).toHaveCount(0);
  await page.getByRole("radio", { name: "Snap to grid" }).click();

  await page.getByRole("button", { name: "Colour: Red" }).click();
  const at = await sheetBox(page);
  await page.keyboard.press("l");
  await drag(page, at(0.1, 0.1), at(0.5, 0.1));
  const line = sheet(page).locator("line[data-element-id]");
  await expect(line).toHaveAttribute("stroke", "#c0392b");
  // Snapping puts the end points on the 10 mm grid.
  expect(Number(await line.getAttribute("x1")) % 10).toBe(0);
  expect(Number(await line.getAttribute("x2")) % 10).toBe(0);
});

test("annotates an imported drawing on its sheet", async ({ page }) => {
  await chooseImages(page, () => page.getByRole("button", { name: "Attach image" }).click(), [
    { name: "ground-floor.png", kind: "plan" },
  ]);
  await expect(sheet(page).locator("image")).toBeVisible();
  await expect(page.getByText("ground-floor.png")).toBeVisible();
  const resolution = page.getByLabel("Resolution");
  await resolution.fill("300");
  await resolution.press("Enter");
  // 1400 × 1000 px at 300 dpi is 118.5 × 84.7 mm on paper; the drawing scale is unchanged.
  await expect(page.getByText("118.5 × 84.7 mm")).toBeVisible();
  await expect(page.getByTestId("tb-format")).toContainText("1:100");
  const at = await sheetBox(page);
  await page.keyboard.press("r");
  await drag(page, at(0.3, 0.3), at(0.6, 0.6));
  await expect(elements(page)).toHaveCount(1);
});

test("keeps drawing content when saving and reopening", async ({ page }) => {
  await drawEveryTool(page);
  await page.getByLabel("Paper", { exact: true }).selectOption("A2");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.keyboard.press("Control+s"),
  ]);
  const text = readFileSync((await download.path())!, "utf8");
  const saved = JSON.parse(text) as {
    schemaVersion: number;
    drawings: { elements: { type: string }[]; sheet: { format: { preset: string } } }[];
  };
  expect(saved.schemaVersion).toBe(2);
  expect(saved.drawings[0]!.sheet.format.preset).toBe("A2");
  expect(saved.drawings[0]!.elements.map((e) => e.type).sort()).toEqual([
    "ellipse",
    "line",
    "path",
    "polyline",
    "rect",
    "text",
  ]);

  await page.keyboard.press("Control+n");
  await expect(page.getByRole("heading", { name: "Build the drawing set" })).toBeVisible();
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.keyboard.press("Control+o"),
  ]);
  await chooser.setFiles({
    name: "saved.archcompose",
    mimeType: "application/json",
    buffer: Buffer.from(text),
  });
  await expect(elements(page)).toHaveCount(6);
  await expect(page.getByTestId("tb-format")).toContainText("A2 landscape");
  await expect(sheet(page).locator("text")).toHaveText("Living room");
});
