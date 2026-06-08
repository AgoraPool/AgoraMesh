import cs from './cs.json';
import en from './en.json';

describe('localization resources', () => {
  it('loads English and Czech with matching keys', () => {
    expect(en['home.title']).toBe('AgoraMesh');
    expect(cs['home.title']).toBe('AgoraMesh');
    expect(Object.keys(cs).sort()).toEqual(Object.keys(en).sort());
  });
});
