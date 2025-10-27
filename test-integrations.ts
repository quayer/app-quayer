import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const BASE_URL = "http://localhost:3000";
const SCREENSHOTS_DIR = "test-screenshots";

// Create screenshots directory
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR);
}

async function test() {
  console.log("Starting browser automation test...");
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Enable console logging
    page.on("console", (msg) => console.log("BROWSER LOG: " + msg.text()));
    page.on("pageerror", (error) => console.error("PAGE ERROR: " + error));

    // Log all network requests
    page.on("response", (response) => {
      console.log("[" + response.status() + "] " + response.url());
    });

    // Step 1: Navigate to integrations page directly
    console.log("\n1. Navigating to localhost:3000/integracoes...");
    await page.goto(BASE_URL + "/integracoes");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Take screenshot of initial state
    console.log("2. Taking screenshot of initial state...");
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, "01-initial-state.png"),
      fullPage: true,
    });
    console.log("Screenshot saved: 01-initial-state.png");

    // Step 2: Look for "Nova Integração" button
    console.log("\n3. Looking for create button...");
    const createButton = await page.locator('button').filter({ hasText: /Nova.*Integra/ }).first();
    const isVisible = await createButton.isVisible().catch(() => false);
    
    if (isVisible) {
      console.log("4. Button found. Clicking...");
      await createButton.click();
      await page.waitForTimeout(1000);

      // Take screenshot after clicking
      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, "02-after-click-button.png"),
        fullPage: true,
      });
      console.log("Screenshot saved: 02-after-click-button.png");

      // Step 3: Fill form
      console.log("\n5. Looking for form inputs...");
      const nameInput = await page.locator('input[type="text"]').first();
      const inputExists = await nameInput.isVisible().catch(() => false);
      
      if (inputExists) {
        await nameInput.fill("Test Instance");
        console.log("Form filled with: Test Instance");

        // Step 4: Submit form
        console.log("\n6. Submitting form...");
        const submitButton = await page.locator('button[type="submit"]').first();
        await submitButton.click();
        console.log("Form submitted");

        // Wait for response
        await page.waitForTimeout(3000);

        // Take screenshot after submission
        await page.screenshot({
          path: path.join(SCREENSHOTS_DIR, "03-after-submission-3sec.png"),
          fullPage: true,
        });
        console.log("Screenshot saved: 03-after-submission-3sec.png");

        // Check for new card
        console.log("\n7. Checking for new card...");
        const cardExists = await page.locator('text="Test Instance"').isVisible().catch(() => false);
        if (cardExists) {
          console.log("SUCCESS: New card found with 'Test Instance'");
        } else {
          console.log("ISSUE: New card NOT found after submission");
        }
      } else {
        console.log("Name input not found");
      }
    } else {
      console.log("Create button not found");
    }

    console.log("\nTest completed. Screenshots saved in: " + SCREENSHOTS_DIR);
  } catch (error) {
    console.error("Test failed: " + error);
  } finally {
    await browser.close();
  }
}

test();
