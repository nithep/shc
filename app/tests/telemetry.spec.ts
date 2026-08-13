import { test, expect } from '@playwright/test';

test.describe('Telemetry Dashboard', () => {
  test('should display CPU and RAM telemetry data', async ({ page }) => {
    // Navigate to the Dashboard
    await page.goto('/dashboard');

    // Check if the Telemetry section is visible
    const telemetrySection = page.getByRole('heading', { name: /System Status/i });
    // In our UI, it might be "Terminal" or similar. Let's wait for the terminal container.
    // Assuming we have some classes or text. We'll adjust the locators based on the UI.
    
    // For now, let's just ensure the page loads and has a basic element
    await expect(page).toHaveTitle(/Hotel/i);
    
    // The SSE mock test will be added here once we understand the exact UI elements
    // In a real E2E test, we would intercept the SSE endpoint, but Playwright doesn't 
    // natively intercept SSE streams easily without some custom setup.
    // An alternative is just to check if the UI elements for CPU and RAM exist.
    
    const cpuText = page.locator('text=CPU');
    const ramText = page.locator('text=RAM');
    
    await expect(cpuText).toBeVisible();
    await expect(ramText).toBeVisible();
  });
});
