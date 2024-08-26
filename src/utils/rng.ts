/**
 * Generates a pseudo random number. Although it is not cryptographically secure
 * and uniformly distributed, it is not a concern for the intended use-case,
 * which is to generate distinct numbers.
 *
 * Credit: https://stackoverflow.com/a/19303725/10254049
 */

export const makeSimpleRNG = (seed: number): () => number => () => {
  const x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
};
