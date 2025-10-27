import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const BASE_URL = "http://localhost:3000";
const SCREENSHOTS_DIR = "test-screenshots";
const ADMIN_EMAIL = "admin@quayer.com";
const ADMIN_PASSWORD = "admin123456";

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR);
}

async function test() {
  console.log("Starting comprehensive integrations test...");
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  const logs: string[] = [];

  const log = (msg: string) => {
    console.log(msg);
    logs.push(msg);
  };

  try {
    // Enable console logging
    page.on("console", (msg) => {
      const text = msg.text();
      if (text.includes("error") || text.includes("Error") || text.includes("failed")) {
        log("BROWSER ERROR: " + text);
      }
    });

    page.on("response", (response) => {
      if (response.status() >= 400) {
        log("HTTP " + response.status() + ": " + response.url());
      }
    });

    // Step 1: Navigate to login
    log("\n=== STEP 1: Navigate to Login Page ===");
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);
    log("Current URL: " + page.url());
    log("Page title: " + await page.title());

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, "01-login-page.png"),
      fullPage: true,
    });
    log("Screenshot: 01-login-page.png");

    // Step 2: Fill login form
    log("\n=== STEP 2: Fill Login Form ===");
    const emailInput = page.locator('input[type="email"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    const emailVisible = await emailInput.isVisible().catch(() => false);
    const passwordVisible = await passwordInput.isVisible().catch(() => false);

    if (emailVisible && passwordVisible) {
      log("Email and password fields found");
      await emailInput.fill(ADMIN_EMAIL);
      await passwordInput.fill(ADMIN_PASSWORD);
      log("Credentials filled");
    } else {
      log("ERROR: Could not find login fields");
      log("Email visible: " + emailVisible);
      log("Password visible: " + passwordVisible);
    }

    // Step 3: Submit login
    log("\n=== STEP 3: Submit Login Form ===");
    const submitBtn = page.locator('button[type="submit"]').first();
    const submitVisible = await submitBtn.isVisible().catch(() => false);
    if (submitVisible) {
      log("Submit button found. Clicking...");
      await submitBtn.click();
      await page.waitForTimeout(3000);
      log("Login submitted. Current URL: " + page.url());
    } else {
      log("ERROR: Submit button not found");
    }

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, "02-after-login.png"),
      fullPage: true,
    });
    log("Screenshot: 02-after-login.png");

    // Step 4: Navigate to integrations
    log("\n=== STEP 4: Navigate to /integracoes ===");
    await page.goto(BASE_URL + "/integracoes", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    log("Current URL: " + page.url());

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, "03-integracoes-initial.png"),
      fullPage: true,
    });
    log("Screenshot: 03-integracoes-initial.png");

    // Step 5: Check page content
    log("\n=== STEP 5: Check Page Content ===");
    const pageContent = await page.content();
    const hasNewButton = pageContent.includes("Nova Integração") || pageContent.includes("Nova integração");
    log("Has 'Nova Integração' button: " + hasNewButton);

    const createBtn = page.locator('button').filter({ hasText: /Nova.*[Ii]ntegra/ }).first();
    const createVisible = await createBtn.isVisible().catch(() => false);
    log("Create button visible: " + createVisible);

    // Step 6: Click create button
    if (createVisible) {
      log("\n=== STEP 6: Click 'Nova Integração' Button ===");
      await createBtn.click();
      await page.waitForTimeout(1000);
      log("Button clicked");

      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, "04-modal-opened.png"),
        fullPage: true,
      });
      log("Screenshot: 04-modal-opened.png");

      // Step 7: Fill form
      log("\n=== STEP 7: Fill Create Integration Form ===");
      const allInputs = await page.locator("input[type='text'], input[type='email']").all();
      log("Found " + allInputs.length + " text inputs");

      if (allInputs.length > 0) {
        const firstInput = allInputs[0];
        const isVisible = await firstInput.isVisible().catch(() => false);
        log("First input visible: " + isVisible);

        if (isVisible) {
          await firstInput.fill("Test Instance");
          log("Filled first input with 'Test Instance'");

          // Step 8: Submit form
          log("\n=== STEP 8: Submit Form ===");
          const allButtons = await page.locator("button[type='submit']").all();
          log("Found " + allButtons.length + " submit buttons");

          for (let i = 0; i < allButtons.length; i++) {
            const btnText = await allButtons[i].textContent();
            log("Button " + i + ": " + btnText);
            if (btnText && (btnText.includes("Criar") || btnText.includes("Próximo"))) {
              log("Clicking button: " + btnText);
              await allButtons[i].click();
              break;
            }
          }

          // Wait for form submission
          await page.waitForTimeout(3000);
          log("Form submitted and waited 3 seconds");

          await page.screenshot({
            path: path.join(SCREENSHOTS_DIR, "05-after-submission.png"),
            fullPage: true,
          });
          log("Screenshot: 05-after-submission.png");

          // Step 9: Check if card appears
          log("\n=== STEP 9: Verify Card Appearance ===");
          const cardExists = await page.locator('text="Test Instance"').isVisible().catch(() => false);
          log("Card with 'Test Instance' found: " + cardExists);

          if (!cardExists) {
            const allText = await page.innerText("body");
            const hasTestInstance = allText.includes("Test Instance");
            log("Text 'Test Instance' anywhere on page: " + hasTestInstance);
          }
        }
      } else {
        log("ERROR: No text inputs found in modal");
      }
    } else {
      log("ERROR: Create button not found or not visible");
      const allButtons = await page.locator("button").all();
      log("Total buttons: " + allButtons.length);
      for (let i = 0; i < Math.min(5, allButtons.length); i++) {
        const text = await allButtons[i].textContent();
        log("Button " + i + ": " + text);
      }
    }

    // Final screenshot
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, "06-final-state.png"),
      fullPage: true,
    });
    log("Screenshot: 06-final-state.png");

    log("\n=== TEST COMPLETED ===");
    log("All screenshots saved in: " + SCREENSHOTS_DIR);

    // Save logs
    fs.writeFileSync(path.join(SCREENSHOTS_DIR, "test-log.txt"), logs.join("\n"));
    log("Log saved to: test-log.txt");

  } catch (error) {
    log("ERROR: " + error);
    log("Stack: " + (error instanceof Error ? error.stack : ""));
  } finally {
    await browser.close();
  }
}

test();
