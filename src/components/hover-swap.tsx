/**
 * Shows `primary` text by default, swaps to `secondary` on hover.
 * Wraps itself in a `group` so it works standalone — no parent `group` needed.
 */
const HoverSwap = ({ primary, secondary }: { primary: string; secondary: string }) => (
  <span className="group/swap relative">
    <span className="group-hover/swap:invisible">{primary}</span>
    <span className="invisible absolute left-0 top-0 group-hover/swap:visible whitespace-nowrap">{secondary}</span>
  </span>
)

export default HoverSwap
