import { useState, useEffect, useCallback, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { cn } from "../lib/utils";

// ---- Generic Modal ----

interface ModalBaseProps {
  open: boolean;
  onClose: () => void;
  title: string;
}

interface PickerModalProps extends ModalBaseProps {
  mode: "picker";
  items: { id: string; label: string; description?: string }[];
  onSelect: (id: string) => void;
}

interface ConfirmModalProps extends ModalBaseProps {
  mode: "confirm";
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel?: () => void;
}

interface PromptModalProps extends ModalBaseProps {
  mode: "prompt";
  message: string;
  placeholder?: string;
  defaultValue?: string;
  onSubmit: (value: string) => void;
  onCancel?: () => void;
}

type ModalProps = PickerModalProps | ConfirmModalProps | PromptModalProps;

export function Modal(props: ModalProps) {
  const { open, onClose, title, mode } = props;

  if (mode === "picker") {
    return (
      <PickerModal
        mode="picker"
        open={open}
        onClose={onClose}
        title={title}
        items={props.items}
        onSelect={props.onSelect}
      />
    );
  }

  if (mode === "confirm") {
    return (
      <ConfirmModal
        mode="confirm"
        open={open}
        onClose={onClose}
        title={title}
        message={props.message}
        confirmLabel={props.confirmLabel}
        cancelLabel={props.cancelLabel}
        onConfirm={props.onConfirm}
        onCancel={props.onCancel}
      />
    );
  }

  if (mode === "prompt") {
    return (
      <PromptModal
        mode="prompt"
        open={open}
        onClose={onClose}
        title={title}
        message={props.message}
        placeholder={props.placeholder}
        defaultValue={props.defaultValue}
        onSubmit={props.onSubmit}
        onCancel={props.onCancel}
      />
    );
  }

  return null;
}

// ---- Picker ----

function PickerModal({
  open,
  onClose,
  title,
  items,
  onSelect,
}: PickerModalProps) {
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const filtered = query
    ? items.filter(
        (item) =>
          item.label.toLowerCase().includes(query.toLowerCase()) ||
          item.description?.toLowerCase().includes(query.toLowerCase())
      )
    : items;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIdx((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (filtered[selectedIdx]) {
            onSelect(filtered[selectedIdx].id);
          }
          break;
      }
    },
    [filtered, selectedIdx, onSelect]
  );

  // Scroll selected into view
  useEffect(() => {
    const el = listRef.current?.children[selectedIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md overflow-hidden">
        <DialogTitle>{title}</DialogTitle>
        <div className="mt-2 overflow-hidden" onKeyDown={handleKeyDown}>
          <Input
            ref={inputRef}
            placeholder="Search..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIdx(0);
            }}
            className="mb-2"
          />
          <div
            ref={listRef}
            className="max-h-60 overflow-y-auto rounded-md border"
          >
            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                No results
              </div>
            ) : (
              filtered.map((item, i) => (
                <button
                  key={item.id}
                  className={cn(
                    "flex w-full min-w-0 items-center gap-1.5 px-3 py-2 text-left text-sm transition-colors",
                    i === selectedIdx
                      ? "bg-accent text-accent-foreground"
                      : "text-popover-foreground hover:bg-muted"
                  )}
                  onClick={() => onSelect(item.id)}
                  onMouseEnter={() => setSelectedIdx(i)}
                >
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.description && (
                    <span className="shrink-0 text-xs text-muted-foreground truncate max-w-[120px]">
                      {item.description}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---- Confirm ----

function ConfirmModal({
  open,
  onClose,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <Dialog open={open} onOpenChange={(open) => !open && (onCancel?.() || onClose())}>
      <DialogContent className="sm:max-w-sm">
        <DialogTitle>{title}</DialogTitle>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => {
              onCancel?.();
              onClose();
            }}
          >
            {cancelLabel}
          </Button>
          <Button
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---- Prompt ----

function PromptModal({
  open,
  onClose,
  title,
  message,
  placeholder,
  defaultValue = "",
  onSubmit,
  onCancel,
}: PromptModalProps) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValue(defaultValue);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, defaultValue]);

  return (
    <Dialog open={open} onOpenChange={(open) => !open && (onCancel?.() || onClose())}>
      <DialogContent className="sm:max-w-sm">
        <DialogTitle>{title}</DialogTitle>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <Input
          ref={inputRef}
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="mt-2"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSubmit(value);
              onClose();
            }
          }}
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => {
              onCancel?.();
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              onSubmit(value);
              onClose();
            }}
          >
            Submit
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
