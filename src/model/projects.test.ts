import { describe, expect, it } from 'vitest';
import { baselineProjects, baselineSupply } from '../data/baseline';
import type { Project } from '../schema';
import {
  channelTargets,
  computedStatus,
  expectedProgress,
  formatDate,
  projectedEnd,
  projectStatus,
  projectsToCapacity,
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

describe('capacity', () => {
  it('counts only projects expected to finish by the year', () => {
    const list = [p({ id: 'a', progressPct: 60 }), p({ id: 'b', progressPct: 25 }), p({ id: 'c', channel: 'wind' })];
    expect(projectsToCapacity(list, 'solar', 2028, '2027-01-01')).toBeCloseTo(0.5);
    expect(projectsToCapacity(list, 'solar', 2030, '2027-01-01')).toBeCloseTo(1);
  });
  it('targets are the new capacity the supply scenario needs', () => {
    const t = channelTargets(baselineSupply, 2025, 2030);
    expect(t.solar).toBeCloseTo(9);
    expect(t.coal).toBe(0);
    expect(t.import).toBe(0);
  });
  it('baseline projects validate and reference real channels', () => {
    const keys = new Set(baselineSupply.sources.map((s) => s.key));
    expect(baselineProjects.projects.length).toBeGreaterThanOrEqual(8);
    for (const pr of baselineProjects.projects) expect(keys.has(pr.channel)).toBe(true);
    const statuses = new Set(baselineProjects.projects.map((x) => projectStatus(x, baselineProjects.asOf)));
    expect(statuses.size).toBe(3);
  });
});
