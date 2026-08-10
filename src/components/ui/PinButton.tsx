import "./pin-button.css";

interface Props {
  pinned: boolean;
  label: string;
  onToggle: () => void;
}

/**
 * The pin is shared between both partners, so the label says so — "pinned" on
 * a board two people read means something different from a private bookmark.
 */
export function PinButton({ pinned, label, onToggle }: Props) {
  return (
    <button
      type="button"
      className={`pin-button${pinned ? " pin-button--on" : ""}`}
      aria-pressed={pinned}
      aria-label={pinned ? `Unpin ${label}` : `Pin ${label} for both of you`}
      title={pinned ? "Pinned — visible to both of you" : "Pin for both of you"}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path
          d="M8 1.6l1.9 4.1 4.5.6-3.3 3.1.8 4.4L8 11.7l-3.9 2.1.8-4.4L1.6 6.3l4.5-.6z"
          fill={pinned ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
