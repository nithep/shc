import { test, expect } from '@playwright/test';
import {
  clearGuestToken,
  getGuestToken,
  resolveCheckoutToken,
  setGuestToken,
} from '../src/lib/guestToken';
import { canCheckout } from '../src/lib/roles';

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map<string, string>(Object.entries(initial));
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key: string) => (data.has(key) ? data.get(key)! : null),
    key: (index: number) => Array.from(data.keys())[index] ?? null,
    removeItem: (key: string) => {
      data.delete(key);
    },
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

async function openScanForm(page: import('@playwright/test').Page, room = '101') {
  await page.goto(`/scan?room=${room}`);
  await page.getByRole('button', { name: 'ไม่มี QR Code? กรอกข้อมูลด้วยตนเอง' }).click();
  await page.getByRole('button', { name: /เช็คเอาท์/ }).click();
}

async function mockDashboardApis(page: import('@playwright/test').Page) {
  await page.route('**/api/rooms', (route) =>
    route.fulfill({
      json: {
        success: true,
        rooms: [
          {
            id: 101,
            status: 'occupied',
            power: true,
            guest_name: 'Test Guest',
            checkout_date: new Date(Date.now() + 86400000).toISOString(),
          },
        ],
      },
    })
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
}

test.describe('guest token helper', () => {
  test('reads legacy keys and writes the unified key', () => {
    const storage = memoryStorage({ hotel_guest_token_101: 'legacy-single' });
    expect(getGuestToken('101', storage)).toBe('legacy-single');

    setGuestToken('101', 'unified-token', storage);
    expect(getGuestToken('101', storage)).toBe('unified-token');
    expect(storage.getItem('shc_guest_token_101')).toBe('unified-token');

    clearGuestToken('101', storage);
    expect(getGuestToken('101', storage)).toBeNull();
  });

  test('reads the double-prefixed legacy key', () => {
    const storage = memoryStorage({ hotel_hotel_guest_token_202: 'legacy-double' });
    expect(getGuestToken('202', storage)).toBe('legacy-double');
  });

  test('falls back to staff auth token for checkout', () => {
    const guestStorage = memoryStorage({ shc_guest_token_101: 'guest-token' });
    expect(resolveCheckoutToken('101', guestStorage)).toEqual({
      token: 'guest-token',
      source: 'guest',
    });

    const staffStorage = memoryStorage({ auth_token: 'staff-token' });
    expect(resolveCheckoutToken('101', staffStorage)).toEqual({
      token: 'staff-token',
      source: 'staff',
    });

    expect(resolveCheckoutToken('101', memoryStorage())).toBeNull();
  });

  test('checkout role capability is limited to owner and front_desk', () => {
    expect(canCheckout('owner')).toBe(true);
    expect(canCheckout('front_desk')).toBe(true);
    expect(canCheckout('admin')).toBe(false);
    expect(canCheckout('staff')).toBe(false);
    expect(canCheckout('guest')).toBe(false);
  });
});

test.describe('session token flows', () => {
  test('CheckIn stores the returned guest token under the unified key', async ({ page }) => {
    await page.route('**/api/checkin', (route) =>
      route.fulfill({
        json: {
          success: true,
          token: 'guest-token-101',
          checkoutDate: new Date(Date.now() + 86400000).toISOString(),
        },
      })
    );

    await page.goto('/checkin?room=101');
    await page.getByPlaceholder('ชื่อ-นามสกุล').fill('Test Guest');
    await page.getByRole('button', { name: /ถัดไป/ }).click();
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: /ยืนยัน & เช็คอิน/ }).click();

    await expect(page.getByText('เช็คอินสำเร็จ!')).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('shc_guest_token_101')))
      .toBe('guest-token-101');
  });

  test('Scan checkout without any token does not call the API', async ({ page }) => {
    let checkoutCalls = 0;
    await page.route('**/api/checkout', (route) => {
      checkoutCalls++;
      return route.fulfill({ status: 200, json: { success: true } });
    });

    await openScanForm(page);
    await page.getByRole('button', { name: /ยืนยันการทำรายการ/ }).click();

    await expect(
      page.getByText('ไม่พบโทเคนของห้องนี้ กรุณาเช็กอินก่อน หรือเข้าสู่ระบบพนักงาน')
    ).toBeVisible();
    expect(checkoutCalls).toBe(0);
  });

  test('Scan checkout uses staff auth token when no guest token exists', async ({ page }) => {
    let authorization = '';
    await page.addInitScript(() => localStorage.setItem('auth_token', 'staff-token-abc'));
    await page.route('**/api/checkout', (route) => {
      authorization = route.request().headers()['authorization'] || '';
      return route.fulfill({
        status: 200,
        json: { success: true, message: 'ok', hardware_status: { success: true } },
      });
    });

    await openScanForm(page);
    await page.getByRole('button', { name: /ยืนยันการทำรายการ/ }).click();

    await expect(page.getByText('ทำรายการสำเร็จ!')).toBeVisible();
    expect(authorization).toBe('Bearer staff-token-abc');
  });

  test('owner sees checkout button on Dashboard', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('auth_token', 'owner-token');
      localStorage.setItem('user_role', 'owner');
    });
    await mockDashboardApis(page);

    await page.goto('/admin/dashboard');
    await expect(page.locator('button[title="เช็คเอาท์"]')).toBeVisible();
  });

  test('front_desk sees checkout button on Dashboard', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('auth_token', 'frontdesk-token');
      localStorage.setItem('user_role', 'front_desk');
    });
    await mockDashboardApis(page);

    await page.goto('/staff/dashboard');
    await expect(page.locator('button[title="เช็คเอาท์"]')).toBeVisible();
  });

  test('guest cannot reach Dashboard and has no checkout button', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('auth_token', 'guest-token');
      localStorage.setItem('user_role', 'guest');
    });

    await page.goto('/admin/dashboard');
    await expect(page).toHaveURL(/.*\/unauthorized/);
    await expect(page.locator('button[title="เช็คเอาท์"]')).toHaveCount(0);
  });
});
