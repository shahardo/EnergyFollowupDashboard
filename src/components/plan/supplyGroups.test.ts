import { describe, expect, it } from 'vitest';
import { baselineSupply } from '../../data/baseline';
import { supplyGroupKeys } from './supplyGroups';

describe('supplyGroupKeys', () => {
  it('lists the categories with more than one source', () => {
    const keys = supplyGroupKeys(baselineSupply.sources, 'sources');
    expect(keys).toEqual(['cat:gas', 'cat:solar', 'cat:storage', 'cat:hydrogen', 'cat:fuels', 'cat:other']);
    expect(supplyGroupKeys(baselineSupply.sources, 'carriers')).toEqual(['scarrier:electricity', ...keys]);
  });
});
