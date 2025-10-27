import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const BASE_URL = "http://localhost:3000";
const SCREENSHOTS_DIR = "test-screenshots";
const ADMIN_EMAIL = "admin@quayer.com";

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR);
}

async function test() {
  console.log("Starting test with direct API login...");
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  const logs: string[] = [];

  const log = (msg: string) => {
    console.log(msg);
    logs.push(msg);
  };

  try {
    // Step 1: Request OTP via API
    log("\n=== STEP 1: Request OTP via API ===");
    const otpResponse = await fetch(BASE_URL + "/api/v1/auth/login-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: ADMIN_EMAIL })
    });

    log("OTP Request Status: " + otpResponse.status);
    const otpData = await otpResponse.json();
    log("OTP Response: " + JSON.stringify(otpData));

    if (!otpData.success) {
      throw new Error("Failed to request OTP: " + JSON.stringify(otpData));
    }

    const otp = otpData.data?.otp;
    log("OTP Code: " + otp);

    if (!otp) {
      log("ERROR: No OTP returned. Checking localStorage for token...");
    }

    // Step 2: Verify OTP
    log("\n=== STEP 2: Verify OTP via API ===");
    const verifyResponse = await fetch(BASE_URL + "/api/v1/auth/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: ADMIN_EMAIL, code: otp })
    });

    log("Verify Status: " + verifyResponse.status);
    const verifyData = await verifyResponse.json();
    log("Verify Response: " + JSON.stringify(verifyData));

    const token = verifyData.data?.accessToken;
    if (!token) {
      throw new Error("No token returned from verify: " + JSON.stringify(verifyData));
    }

    log("Token received: " + token.substring(0, 20) + "...");

    // Step 3: Navigate with token
    log("\n=== STEP 3: Navigate to integrations with token ===");
    await context.addCookies([{
      name: "accessToken",
      value: token,
      url: BASE_URL
    }]);

    await page.goto(BASE_URL + "/integracoes", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    log("Current URL: " + page.url());

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, "10-integracoes-initial.png"),
      fullPage: true,
    });
    log("Screenshot: 10-integracoes-initial.png");

    // Step 4: Check page content
    log("\n=== STEP 4: Check Page Content ===");
    const pageTitle = await page.title();
    log("Page title: " + pageTitle);

    const hasNewButton = await page.locator('button').filter({ hasText: /Nova.*[Ii]ntegra/ }).count();
    log("Found " + hasNewButton + " create buttons");

    if (hasNewButton > 0) {
      // Step 5: Click create button
      log("\n=== STEP 5: Click 'Nova Integração' Button ===");
      const createBtn = page.locator('button').filter({ hasText: /Nova.*[Ii]ntegra/ }).first();
      await createBtn.click();
      await page.waitForTimeout(1000);

      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, "11-modal-opened.png"),
        fullPage: true,
      });
      log("Screenshot: 11-modal-opened.png");

      // Step 6: Navigate to config step
      log("\n=== STEP 6: Navigate to config step ===");
      const nextBtn = page.locator('button').filter({ hasText: /Próximo/ }).first();
      const nextExists = await nextBtn.isVisible().catch(() => false);
      if (nextExists) {
        await nextBtn.click();
        await page.waitForTimeout(1000);
        log("Clicked Próximo button");
      }

      // Step 7: Fill form
      log("\n=== STEP 7: Fill Create Integration Form ===");
      const nameInput = page.locator('input').first();
      const nameVisible = await nameInput.isVisible().catch(() => false);
      
      if (nameVisible) {
        await nameInput.fill("Test Instance");
        log("Filled name input with 'Test Instance'");

        await page.screenshot({
          path: path.join(SCREENSHOTS_DIR, "12-form-filled.png"),
          fullPage: true,
        });
        log("Screenshot: 12-form-filled.png");

        // Step 8: Submit form
        log("\n=== STEP 8: Submit Form ===");
        const submitBtn = page.locator('button').filter({ hasText: /Criar/ }).first();
        const submitVisible = await submitBtn.isVisible().catch(() => false);
        
        if (submitVisible) {
          await submitBtn.click();
          log("Clicked Criar button");

          // Wait for response
          await page.waitForTimeout(3000);
          log("Waited 3 seconds after submission");

          await page.screenshot({
            path: path.join(SCREENSHOTS_DIR, "13-after-submission.png"),
            fullPage: true,
          });
          log("Screenshot: 13-after-submission.png");

          // Step 9: Check if card appears
          log("\n=== STEP 9: Verify Card Appearance ===");
          const cardExists = await page.locator('text="Test Instance"').isVisible().catch(() => false);
          log("Card with 'Test Instance' found: " + cardExists);

          if (cardExists) {
            log("SUCCESS: New card appears after creation!");
          } else {
            log("ISSUE: Card not found after creation");
            const allText = await page.innerText("body");
            const hasTestInPage = allText.includes("Test Instance");
            log("Text 'Test Instance' exists on page: " + hasTestInPage);
          }
        } else {
          log("ERROR: Submit button not found");
        }
      } else {
        log("ERROR: Name input not visible");
      }
    } else {
      log("ERROR: No create buttons found");
    }

    // Final screenshot
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, "14-final-state.png"),
      fullPage: true,
    });
    log("Screenshot: 14-final-state.png");

    log("\n=== TEST COMPLETED ===");

  } catch (error) {
    log("ERROR: " + error);
  } finally {
    fs.writeFileSync(path.join(SCREENSHOTS_DIR, "test-api-login-log.txt"), logs.join("\n"));
    log("Log saved");
    await browser.close();
  }
}

test();
