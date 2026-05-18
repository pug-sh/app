/**
 * Shows `primary` text by default, swaps to `secondary` on hover.
 * Stacks both in one grid cell so the wrapper sizes to max(primary, secondary) —
 * prevents the on-hover text from spilling over adjacent siblings.
 */
const HoverSwap = ({ primary, secondary }: { primary: string; secondary: string }) => (
  <span className="group/swap inline-grid whitespace-nowrap">
    <span className="col-start-1 row-start-1 group-hover/swap:invisible">{primary}</span>
    <span className="col-start-1 row-start-1 invisible group-hover/swap:visible">{secondary}</span>
  </span>
)

export default HoverSwap
