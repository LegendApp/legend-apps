import type { Observable } from '@legendapp/state';
import { useSelector } from '@legendapp/state/react';
import { useMemo } from 'react';

/**
 * Hook that returns the current breakpoint based on window width
 * @param breakpoints Record of breakpoint widths to names, e.g. { 640: 'sm', 768: 'md', 1024: 'lg' }
 * @returns Object containing the name and value of the largest breakpoint that is smaller than the current width
 */
export function useBreakpoints(
  windowDimensions$: Observable<{ width: number; height: number }>,
  breakpoints: Record<number, string>
): {
  breakpoint: string;
  breakpointWidth: number;
} {
  // Cache the sorted breakpoints
  const sortedBreakpoints = useMemo(() => {
    // Get all breakpoint widths as numbers
    const breakpointWidths = Object.keys(breakpoints).map(Number);
    // Sort breakpoints in descending order
    return breakpointWidths.sort((a, b) => b - a);
  }, [breakpoints]);

  return useSelector(() => {
    const width = windowDimensions$.width.get();

    // Find the largest breakpoint that is smaller than or equal to the current width
    const activeBreakpoint = sortedBreakpoints.find((bp) => width >= bp);

    // Return both the breakpoint name and value
    if (activeBreakpoint !== undefined) {
      return {
        breakpoint: breakpoints[activeBreakpoint],
        breakpointWidth: activeBreakpoint,
      };
    }
    return {
      breakpoint: '',
      breakpointWidth: 0,
    };
  });
}
