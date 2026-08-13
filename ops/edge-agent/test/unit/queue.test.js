'use strict';

const { CommandQueue } = require('../../queue');

describe('CommandQueue Utility', () => {
  let queue;

  beforeEach(() => {
    queue = new CommandQueue();
  });

  test('ควรประมวลผลคำสั่งตามลำดับ FIFO', async () => {
    const executionOrder = [];

    const task1 = () => new Promise(resolve => {
      setTimeout(() => {
        executionOrder.push(1);
        resolve(1);
      }, 50);
    });

    const task2 = () => new Promise(resolve => {
      setTimeout(() => {
        executionOrder.push(2);
        resolve(2);
      }, 10); // Shorter timeout, but should run after task1
    });

    const p1 = queue.add(task1);
    const p2 = queue.add(task2);

    expect(queue.size).toBe(1); // Task 2 is waiting (size=1)
    expect(queue.isRunning).toBe(true);

    const results = await Promise.all([p1, p2]);

    expect(results).toEqual([1, 2]);
    expect(executionOrder).toEqual([1, 2]);
    expect(queue.size).toBe(0);
    await new Promise(resolve => setTimeout(resolve, 150));
    expect(queue.isRunning).toBe(false);
  });

  test('ควรจับและส่ง Error ออกมาได้ถูกต้องหากฟังก์ชันนั้นพัง', async () => {
    const successTask = () => Promise.resolve('OK');
    const failingTask = () => Promise.reject(new Error('FAIL'));

    const p1 = queue.add(failingTask);
    const p2 = queue.add(successTask);

    await expect(p1).rejects.toThrow('FAIL');
    await expect(p2).resolves.toBe('OK');
  });

  test('ควรสามารถล้างคิว (clear) งานที่เหลืออยู่ได้เมื่อสั่งการ', async () => {
    const task = () => new Promise(resolve => setTimeout(() => resolve('OK'), 50));
    
    const p1 = queue.add(task);
    const p2 = queue.add(task);
    const p3 = queue.add(task);

    expect(queue.size).toBe(2);

    // ป้องกัน Unhandled Rejection Warning ใน Node.js
    p2.catch(() => {});
    p3.catch(() => {});

    // ล้างคิวทันที
    queue.clear();

    await expect(p1).resolves.toBe('OK'); // Task 1 กำลังทำงานอยู่จึงไม่ถูกยกเลิกกลางคัน
    await expect(p2).rejects.toThrow('Command queue cleared');
    await expect(p3).rejects.toThrow('Command queue cleared');

    expect(queue.size).toBe(0);
    await new Promise(resolve => setTimeout(resolve, 150));
    expect(queue.isRunning).toBe(false);
  });
});
