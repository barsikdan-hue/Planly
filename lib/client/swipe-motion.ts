export type SwipeDirection = 'pending' | 'horizontal' | 'vertical';
export type ReviewInputMethod = 'gesture' | 'button' | 'keyboard';
export function swipeDirection(dx: number, dy: number): SwipeDirection {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 12) return 'pending';
  return Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
}
export function swipeDecision(dx: number, dy: number): 'approve' | 'reject' | null {
  return Math.abs(dx) >= 80 && Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 'approve' : 'reject' : null;
}
export function swipeRotation(dx: number): number { return Math.max(-8, Math.min(8, dx / 20)); }
