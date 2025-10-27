import { chromium } from "playwright";
import fs from "fs";

const BASE_URL = "http://localhost:3000";
const SCREENSHOTS_DIR = "test-screenshots";

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR);
}

async function test() {
  console.log("Starting test...");
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  try {
    // Navigate to homepage
    console.log("Navigating to " + BASE_URL);
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    
    console.log("Current URL: " + page.url());
    const title = await page.title();
    console.log("Page title: " + title);
    
    // Take screenshot
    await page.screenshot({ path: SCREENSHOTS_DIR + "/01-home.png", fullPage: true });
    console.log("Screenshot saved");
    
  } catch (error) {
    console.error("Error: " + error);
  } finally {
    await browser.close();
  }
}

test();
