import { test, expect } from '@playwright/test';

// ─── RBAC & Authorization Tests ────────────────────────────────────────────────────────
test.describe('RBAC Routing & Security Verification', () => {

  test('1. Guest / Unauthenticated user should be redirected from /admin to /login', async ({ page }) => {
    await page.goto('/admin');
    
    // ควรถูกเด้งไปหน้า /login อัตโนมัติ เพราะไม่มี Token
    await expect(page).toHaveURL(/.*\/login/);
    
    // เช็คว่ามีข้อความ "เข้าสู่ระบบ" บนหน้า Login
    const loginHeader = page.locator('text=เข้าสู่ระบบ').first();
    await expect(loginHeader).toBeVisible();
  });

  test('2. Staff (front_desk) should be blocked from accessing /admin with <Unauthorized /> screen', async ({ page }) => {
    // เข้าหน้าหลักก่อนเพื่อ set localStorage (จำลองการ Login เป็น Staff)
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('auth_token', 'mock-staff-token');
      localStorage.setItem('user_role', 'staff');
    });

    // พยายามเข้า /admin ซึ่งต้องใช้สิทธิ์ 'admin'
    await page.goto('/admin');

    // ต้องไม่โดนเด้งไป /login แต่ต้องเด้งไป /unauthorized แทนตามกฎที่เราแก้ไว้
    await expect(page).toHaveURL(/.*\/unauthorized/);

    // ตรวจสอบ UI ว่าขึ้นหน้า Access Denied
    await expect(page.locator('text=ปฏิเสธการเข้าถึง')).toBeVisible();
    await expect(page.locator('text=บัญชีของคุณไม่มีสิทธิ์ในการเข้าถึงหน้านี้')).toBeVisible();
  });

  test('3. Admin (owner) should be able to access /admin', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('auth_token', 'mock-admin-token');
      localStorage.setItem('user_role', 'owner'); // owner map เป็น admin
    });

    // เข้า /admin
    await page.goto('/admin');

    // ต้องอยู่ในหน้า /admin ไม่โดนเด้ง
    await expect(page).toHaveURL(/.*\/admin/);
    // ตรวจสอบว่าหน้าแดชบอร์ดโหลดขึ้นมา
    await expect(page.locator('text=Hotel ECS')).toBeVisible();
  });
});

// ─── Guest Views Verification ──────────────────────────────────────────────────────────
test.describe('Guest Mobile-First UI Verification', () => {

  test('1. CheckIn Page should load 4-Step Flow UI', async ({ page }) => {
    await page.goto('/checkin');
    
    // หน้าเช็คอินแบบสแกน QR ต้องโหลดขึ้น
    await expect(page.locator('text=สแกน QR Code ห้องพัก')).toBeVisible();
    
    // ปุ่มเช็คอินแบบกรอกเอง
    const manualBtn = page.locator('button:has-text("กรอกข้อมูลด้วยตนเอง")');
    await expect(manualBtn).toBeVisible();
    await manualBtn.click();

    // เช็คว่าไปหน้า Step ถัดไป (กรอกเลขห้อง)
    await expect(page.locator('text=หมายเลขห้อง *')).toBeVisible();
  });

  test('2. GuestView (Smart Key) without room param should show warning', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('auth_token', 'mock-guest-token');
      localStorage.setItem('user_role', 'guest');
    });
    
    await page.goto('/guest');
    
    // โหลดหน้า guest แบบไม่มี room ควรสรุปว่าไม่พบห้อง
    await expect(page.locator('text=ไม่พบข้อมูลห้อง')).toBeVisible();
    await expect(page.locator('text=กรุณาสแกน QR Code')).toBeVisible();
  });
});
