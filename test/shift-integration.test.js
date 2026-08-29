import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseShiftPage,
  normalizeExShiftDocument,
  findShiftDay,
} from '../src/shift-scraper.js';
import {
  compareShiftWithStatuses,
  isWithinShiftWindow,
  hasShiftStarted,
} from '../src/shift-compare.js';
import { STATUS } from '../src/scraper.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = readFileSync(join(__dirname, 'fixtures/osaka-shift.html'), 'utf8');

describe('shift-scraper', () => {
  it('parses Osaka shift table from HTML fixture', () => {
    const days = parseShiftPage(FIXTURE, 2026);
    assert.ok(days.length >= 1, `expected days, got ${days.length}`);
    const today = findShiftDay(days, '2026-08-29');
    assert.ok(today, 'expected 2026-08-29 shift day');
    assert.ok(today.boys.length >= 5, `expected shifts, got ${today.boys.length}`);

    const tsumugi = today.boys.find((b) => b.name === 'つむぎ');
    assert.ok(tsumugi, `names: ${today.boys.map((b) => b.name).join(', ')}`);
    assert.equal(tsumugi.boyId, '10235');
    assert.match(tsumugi.shiftTime, /\d{1,2}:\d{2}/);
  });

  it('normalizes EX JSON export', () => {
    const payload = {
      date: '2026-08-29',
      boys: [
        { boyId: '10235', name: 'つむぎ', start: '13:00', end: '21:00' },
        { boyId: '99999', name: 'テスト', start: '10:00', end: '18:00' },
      ],
    };
    const result = normalizeExShiftDocument(payload, '2026-08-29');
    assert.equal(result.dateKey, '2026-08-29');
    assert.equal(result.boys.length, 2);
    assert.equal(result.boys[0].shiftTime, '13:00～21:00');
  });
});

describe('shift-compare', () => {
  const baseConfig = {
    storeName: '大阪店',
    boys: {},
    settings: { shiftGraceMinutes: 15 },
  };

  it('detects scheduled but not online', () => {
    const scheduledBoys = [
      { boyId: '10235', name: 'つむぎ', shiftTime: '13:00～21:00' },
      { boyId: '99999', name: '不在', shiftTime: '14:00～22:00' },
    ];
    const statuses = [{ boyId: '10235', name: 'つむぎ', status: STATUS.WAITING }];
    const result = compareShiftWithStatuses(
      scheduledBoys,
      statuses,
      baseConfig,
      new Date('2026-08-29T06:00:00.000Z') // 15:00 JST
    );
    assert.equal(result.scheduledNotOnline.length, 1);
    assert.equal(result.scheduledNotOnline[0].name, '不在');
    assert.equal(result.onlineNotScheduled.length, 0);
  });

  it('detects online but not on shift', () => {
    const scheduledBoys = [
      { boyId: '10235', name: 'つむぎ', shiftTime: '13:00～21:00' },
    ];
    const statuses = [
      { boyId: '10235', name: 'つむぎ', status: STATUS.WAITING },
      { boyId: '88888', name: '勝手', status: STATUS.IN_CALL },
    ];
    const result = compareShiftWithStatuses(
      scheduledBoys,
      statuses,
      baseConfig,
      new Date('2026-08-29T06:00:00.000Z')
    );
    assert.equal(result.onlineNotScheduled.length, 1);
    assert.equal(result.onlineNotScheduled[0].name, '勝手');
  });

  it('isWithinShiftWindow respects time range', () => {
    const shiftTime = '13:00～21:00';
    assert.equal(
      isWithinShiftWindow(shiftTime, new Date('2026-08-29T03:30:00.000Z')),
      false
    ); // 12:30 JST
    assert.equal(
      isWithinShiftWindow(shiftTime, new Date('2026-08-29T04:00:00.000Z')),
      true
    ); // 13:00 JST
    assert.equal(
      isWithinShiftWindow(shiftTime, new Date('2026-08-29T11:59:00.000Z')),
      true
    ); // 20:59 JST（終了直前）
    assert.equal(
      isWithinShiftWindow(shiftTime, new Date('2026-08-29T12:00:00.000Z')),
      false
    ); // 21:00 JST（終了時刻は含まない）
    assert.equal(
      isWithinShiftWindow(shiftTime, new Date('2026-08-29T12:30:00.000Z')),
      false
    ); // 21:30 JST
  });

  it('hasShiftStarted respects grace minutes', () => {
    const shiftTime = '13:00～21:00';
    assert.equal(
      hasShiftStarted(shiftTime, new Date('2026-08-29T03:59:00.000Z'), 15),
      false
    ); // 12:59 JST
    assert.equal(
      hasShiftStarted(shiftTime, new Date('2026-08-29T04:15:00.000Z'), 15),
      true
    ); // 13:15 JST (13:00 + 15分猶予)
  });
});
