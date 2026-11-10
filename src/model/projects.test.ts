import { describe, expect, it } from 'vitest';
import { baselineProjects, baselineSupply } from '../data/baseline';
import { interpolateCapacity } from './supply';
import type { Project } from '../schema';
import {
  channelTargets,
  computedStatus,
  expectedProgress,
  formatDate,
  projectedEnd,
  projectStatus,
  assignLanes,
  channelProgress,
} from './projects';

const p = (patch: Partial<Project> = {}): Project => ({
  id: 'p', name: 'p', channel: 'solar', owner: 'x', mw: 500,
  plannedStart: '2026-01-01', plannedEnd: '2028-01-01', progressPct: 50, milestones: [], ...patch,
});

describe('expectedProgress', () => {
  it('is linear in time and clamped', () => {
    expect(expectedProgress(p(), '2025-06-01')).toBe(0);
    expect(expectedProgress(p(), '2027-01-01')).toBeCloseTo(50, 0);
    expect(expectedProgress(p(), '2030-01-01')).toBe(100);
  });
});

describe('status', () => {
  it('on-track within 10 points, at-risk within 25, else delayed', () => {
    expect(computedStatus(p({ progressPct: 45 }), '2027-01-01')).toBe('on-track');
    expect(computedStatus(p({ progressPct: 30 }), '2027-01-01')).toBe('at-risk');
    expect(computedStatus(p({ progressPct: 10 }), '2027-01-01')).toBe('delayed');
  });
  it('a finished project is on-track; an explicit status wins', () => {
    expect(computedStatus(p({ progressPct: 100 }), '2030-01-01')).toBe('on-track');
    expect(projectStatus(p({ progressPct: 50, status: 'delayed' }), '2027-01-01')).toBe('delayed');
  });
});

describe('projectedEnd', () => {
  it('keeps the planned end when on schedule', () => {
    expect(formatDate(projectedEnd(p({ progressPct: 60 }), '2027-01-01')!)).toBe('2028-01-01');
  });
  it('extrapolates the current pace when behind', () => {
    // 25% after one year → about four years in total (2028 is a leap year, so it lands a day early).
    const end = formatDate(projectedEnd(p({ progressPct: 25 }), '2027-01-01')!);
    expect(end >= '2029-12-30' && end <= '2030-01-01').toBe(true);
  });
  it('cannot estimate with no progress well after the start', () => {
    expect(projectedEnd(p({ progressPct: 0 }), '2027-01-01')).toBeNull();
  });
});

describe('lanes', () => {
  it('puts overlapping tasks of a channel in separate lanes', () => {
    const list = [
      p({ id: 'a', plannedStart: '2026-01-01', plannedEnd: '2027-01-01', progressPct: 100 }),
      p({ id: 'b', plannedStart: '2026-06-01', plannedEnd: '2027-06-01', progressPct: 100 }),
      p({ id: 'c', plannedStart: '2027-01-01', plannedEnd: '2028-01-01', progressPct: 100 }),
      p({ id: 'd', channel: 'wind', plannedStart: '2026-06-01', plannedEnd: '2027-06-01', progressPct: 100 }),
    ];
    const lanes = assignLanes(list, '2030-01-01');
    expect(lanes.get('a')).toBe(0);
    expect(lanes.get('b')).toBe(1);
    expect(lanes.get('c')).toBe(0); // touches a, doesn't overlap
    expect(lanes.get('d')).toBe(0); // other channel
  });
  it('counts a projected delay as occupying the lane', () => {
    const list = [
      p({ id: 'a', plannedStart: '2026-01-01', plannedEnd: '2027-01-01', progressPct: 25 }),
      p({ id: 'b', plannedStart: '2027-01-01', plannedEnd: '2028-01-01', progressPct: 0 }),
    ];
    expect(assignLanes(list, '2026-07-01').get('b')).toBe(1);
  });
});

describe('capacity', () => {
  it('channel progress is weighted by duration', () => {
    const list = [
      p({ id: 'a', plannedStart: '2026-01-01', plannedEnd: '2027-01-01', progressPct: 100 }),
      p({ id: 'b', plannedStart: '2027-01-01', plannedEnd: '2030-01-01', progressPct: 0 }),
    ];
    expect(channelProgress(list, 'solar')).toBeCloseTo(25, 0);
    expect(channelProgress(list, 'wind')).toBeNull();
  });
  it('targets are the new capacity the supply scenario needs', () => {
    const t = channelTargets(baselineSupply, 2025, 2030);
    const solar = baselineSupply.sources.find((s) => s.key === 'solar')!;
    expect(t.solar).toBeCloseTo(
      interpolateCapacity(solar.capacityGW, 2030) - interpolateCapacity(solar.capacityGW, 2025),
    );
    expect(t.solar).toBeGreaterThan(0);
    expect(t.coal).toBe(0);
    expect(t.importElectricity).toBe(0);
  });
  it('baseline tasks reference real sources and cover every source', () => {
    const keys = new Set(baselineSupply.sources.map((s) => s.key));
    for (const pr of baselineProjects.projects) expect(keys.has(pr.channel)).toBe(true);
    const used = new Set(baselineProjects.projects.map((x) => x.channel));
    for (const k of keys) expect(used.has(k)).toBe(true);
    const lanes = assignLanes(baselineProjects.projects, baselineProjects.asOf);
    expect(Math.max(...lanes.values())).toBeGreaterThanOrEqual(1);
    const lng = baselineProjects.projects.filter((x) => x.channel === 'lng').map((x) => x.name);
    expect(lng).toEqual(['בחינת אתרים', 'תכנון סטטוטורי', 'יציאה למכרז', 'הקמה']);
    const statuses = new Set(baselineProjects.projects.map((x) => projectStatus(x, baselineProjects.asOf)));
    expect(statuses.size).toBe(3);
  });
});
