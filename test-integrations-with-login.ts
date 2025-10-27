import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const BASE_URL = "http://localhost:3000";
const SCREENSHOTS_DIR = "test-screenshots";
const ADMIN_EMAIL = "admin@quayer.com";
const ADMIN_PASSWORD = "admin123456";

// Create screenshots directory
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR);
}

async function test() {
  console.log("Starting browser automation test with login...");
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Enable console logging
    page.on("console", (msg) => console.log("BROWSER LOG: " + msg.text()));
    page.on("pageerror", (error) => console.error("PAGE ERROR: " + error));

    // Log all network requests
    page.on("response", (response) => {
      if (response.status() >= 400) {
        console.log("ERROR [" + response.status() + "] " + response.url());
      }
    });

    // Step 1: Navigate to login
    console.log("\n1. Navigating to login page...");
    await page.goto(BASE_URL + "/login", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    // Take screenshot of login page
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, "00-login-page.png"),
      fullPage: true,
    });
    console.log("Screenshot saved: 00-login-page.png");

    // Step 2: Fill login form
    console.log("\n2. Filling login form with credentials...");
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    console.log("Credentials filled");

    // Step 3: Submit login
    console.log("\n3. Submitting login form...");
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: "networkidle" });
    await page.waitForTimeout(2000);

    console.log("Login completed. Current URL: " + page.url());

    // Take screenshot after login
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, "00b-after-login.png"),
      fullPage: true,
    });

    // Step 4: Navigate to integrations page
    console.log("\n4. Navigating to /integracoes...");
    await page.goto(BASE_URL + "/integracoes", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);

    // Take screenshot of initial state
    console.log("5. Taking screenshot of initial state...");
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, "01-initial-state.png"),
      fullPage: true,
    });
    console.log("Screenshot saved: 01-initial-state.png");

    // Check page content
    const pageTitle = await page.title();
    console.log("Page title: " + pageTitle);

    // Step 5: Look for "Nova Integração" button
    console.log("\n6. Looking for create button...");
    const createButtonLocator = page.locator('button').filter({ hasText: /Nova.*Integra/ }).first();
    const isVisible = await createButtonLocator.isVisible().catch(() => false);
    
    if (isVisible) {
      console.log("7. Button found. Clicking...");
      await createButtonLocator.click();
      await page.waitForTimeout(1000);

      // Take screenshot after clicking
      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, "02-after-click-button.png"),
        fullPage: true,
      });
      console.log("Screenshot saved: 02-after-click-button.png");

      // Step 6: Fill form
      console.log("\n8. Looking for form inputs...");
      const nameInput = page.locator('input[type="text"]').first();
      const inputExists = await nameInput.isVisible().catch(() => false);
      
      if (inputExists) {
        await nameInput.fill("Test Instance");
        console.log("Form filled with: Test Instance");

        // Step 7: Submit form
        console.log("\n9. Submitting form...");
        const submitButton = page.locator('button[type="submit"]').first();
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
        console.log("\n10. Checking for new card...");
        const cardExists = await page.locator('text="Test Instance"').isVisible().catch(() => false);
        if (cardExists) {
          console.log("SUCCESS: New card found with 'Test Instance'");
        } else {
          console.log("ISSUE: New card NOT found after submission");
          
          // Try to find any cards
          const cards = await page.locator('[class*="card"]').count();
          console.log("Total cards on page: " + cards);
        }
      } else {
        console.log("Name input not found");
      }
    } else {
      console.log("Create button not found");
      
      // List all buttons
      const buttons = await page.locator("button").all();
      console.log("Total buttons: " + buttons.length);
      for (let i = 0; i < Math.min(5, buttons.length); i++) {
        const text = await buttons[i].textContent();
        console.log("Button " + i + ": " + text);
      }
    }

    console.log("\nTest completed. Screenshots saved in: " + SCREENSHOTS_DIR);
  } catch (error) {
    console.error("Test failed: " + error);
  } finally {
    await browser.close();
  }
}

test();
