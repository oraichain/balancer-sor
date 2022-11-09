import { BigNumber, parseFixed } from '@ethersproject/bignumber';

// Swap limits: amounts swapped may not be larger than this percentage of total balance.

export const _MAX_IN_RATIO: BigNumber = parseFixed('0.3', 18);
export const _MAX_OUT_RATIO: BigNumber = parseFixed('0.3', 18);

// POW3 constant
// Threshold of x where the normal method of computing x^3 would overflow and we need a workaround.
// Equal to 4.87e13 scaled; 4.87e13 is the point x where x**3 * 10**36 = (x**2 native) * (x native) ~ 2**256
export const _SAFE_LARGE_POW3_THRESHOLD = BigNumber.from(10).pow(29).mul(487);
export const MIDDECIMAL = BigNumber.from(10).pow(9); // splits the fixed point decimals into two equal parts.

// Stopping criterion for the Newton iteration that computes the invariant:
// - Stop if the step width doesn't shrink anymore by at least a factor _INVARIANT_SHRINKING_FACTOR_PER_STEP.
// - ... but in any case, make at least _INVARIANT_MIN_ITERATIONS iterations. This is useful to compensate for a
// less-than-ideal starting point, which is important when alpha is small.
export const _INVARIANT_SHRINKING_FACTOR_PER_STEP = 8;
export const _INVARIANT_MIN_ITERATIONS = 5;
