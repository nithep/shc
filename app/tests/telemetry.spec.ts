import { test, expect } from '@playwright/test';

test.describe('Telemetry Dashboard', () => {
  test('should display CPU and RAM telemetry data', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('auth_token', 'owner-token');
      localStorage.setItem('user_role', 'owner');
    });

    await page.route('**/api/rooms', (route) =>
      route.fulfill({ json: { success: true, rooms: [] } })
    );
    await page.route('**/api/admin/approval', (route) =>
      route.fulfill({ json: { success: true, pending: [] } })
    );
    await page.route('**/api/diagnostics/health', (route) =>
      route.fulfill({
        json: { success: true, report: { pbx: { mode: 'mock', isReady: true, details: '' } } },
      })
    );
    await page.route('**/api/audit/events**', (route) =>
      route.fulfill({ json: { success: true, events: [] } })
    );
    await page.route('**/api/admin/apikeys**', (route) =>
      route.fulfill({ json: { success: true, keys: [] } })
    );
    await page.route('**/api/telemetry/stream', (route) =>
      route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: '' })
    );

    await page.goto('/admin/dashboard');

    await expect(page).toHaveTitle(/Hotel/i);
    await expect(page.getByText('CPU Usage')).toBeVisible();
    await expect(page.getByText('RAM Usage')).toBeVisible();
  });
});
