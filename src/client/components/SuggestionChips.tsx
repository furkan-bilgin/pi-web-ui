import { useChatStore } from "../stores/chat-store";
import { useConnection } from "../lib/connection-provider";

export function SuggestionChips() {
  const suggestions = useChatStore((s) => s.suggestions);
  const setSuggestions = useChatStore((s) => s.setSuggestions);
  const { send } = useConnection();

  if (!suggestions || suggestions.length === 0) return null;

  const handleClick = (text: string) => {
    // Send as a normal prompt
    useChatStore.getState().submitUser(text);
    send({ type: "prompt", message: text, images: [] });
    setSuggestions([]);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-2">
      <div className="flex flex-wrap gap-2">
        {suggestions.map((suggestion, i) => (
          <button
            key={i}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={() => handleClick(suggestion)}
          >
            <span className="truncate max-w-[200px]">{suggestion}</span>
            <span
              className="ml-1 text-muted-foreground/40 hover:text-muted-foreground"
              onClick={(e) => {
                e.stopPropagation();
                setSuggestions(
                  suggestions.filter((_, idx) => idx !== i)
                );
              }}
            >
              &times;
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
