import { FORM_VALUES, isValidFormRating } from '../formRating';

describe('form rating', () => {
  it('goes from 1 to 5 in half steps', () => {
    expect(FORM_VALUES).toHaveLength(9);
    expect(isValidFormRating(3.5)).toBe(true);
    expect(isValidFormRating(1)).toBe(true);
    expect(isValidFormRating(3.25)).toBe(false);
    expect(isValidFormRating(0.5)).toBe(false);
    expect(isValidFormRating(5.5)).toBe(false);
  });
});
