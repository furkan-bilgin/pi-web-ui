import { useState, useCallback, useRef, useEffect } from "react";
import { MessageInput } from "../components/ui/message-input";
import { useChatStore } from "../stores/chat-store";
import { showError } from "../lib/toast";
import { SlashMenu } from "./SlashMenu";

const MAX_IMAGES = 8;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

interface ImageAttachment {
  data: string;       // raw base64 (no prefix)
  mimeType: string;
  url: string;        // data: URL for preview
}

interface ComposerProps {
  onSend: (text: string, images?: { data: string; mimeType: string }[]) => void;
  onAbort: () => void;
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 65536;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as unknown as number[]);
  }
  return btoa(binary);
}

async function fileToImageAttachment(file: File): Promise<ImageAttachment | null> {
  if (!ALLOWED_MIME.has(file.type)) return null;
  if (file.size > MAX_IMAGE_SIZE) return null;
  const buf = await file.arrayBuffer();
  const data = arrayBufferToBase64(buf);
  return { data, mimeType: file.type, url: `data:${file.type};base64,${data}` };
}

export function Composer({ onSend, onAbort }: ComposerProps) {
  const [input, setInput] = useState("");

  // Watch for pendingInput/pendingImages from revert
  const pendingInput = useChatStore((s) => s.pendingInput);
  const pendingImages = useChatStore((s) => s.pendingImages);
  useEffect(() => {
    if (pendingInput) {
      console.log('[Composer] got pendingInput:', pendingInput.slice(0, 50));
      setInput(pendingInput);
      setTimeout(() => {
        useChatStore.getState().setPendingInput(null);
      }, 0);
    }
    if (pendingImages) {
      console.log('[Composer] got pendingImages:', pendingImages.length);
      const attachments: ImageAttachment[] = pendingImages.map((img) => ({
        data: img.data,
        mimeType: img.mimeType,
        url: `data:${img.mimeType};base64,${img.data}`,
      }));
      setImages(attachments);
      setTimeout(() => {
        useChatStore.getState().setPendingImages(null);
      }, 0);
    }
  }, [pendingInput, pendingImages]);
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [showSlash, setShowSlash] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const isRunning = useChatStore((s) => s.isRunning);

  // ── Image paste / drag-drop (matches pi-web-ui-old approach) ──
  // Keep a ref to avoid stale closure in the paste/drag handlers.
  const imagesRef = useRef(images);
  imagesRef.current = images;

  const addImages = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files);
    for (const file of arr) {
      const currentCount = imagesRef.current.length;
      if (currentCount >= MAX_IMAGES) {
        showError(`Maximum ${MAX_IMAGES} images per message.`);
        break;
      }
      if (!ALLOWED_MIME.has(file.type)) {
        showError(`Unsupported image type: ${file.type || "unknown"}`);
        continue;
      }
      if (file.size > MAX_IMAGE_SIZE) {
        showError("Image too large (10 MB max).");
        continue;
      }
      const attachment = await fileToImageAttachment(file);
      if (attachment) {
        setImages((prev) => [...prev, attachment]);
      }
    }
  }, []);

  // Handle paste at the document level (catches pastes anywhere)
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length === 0) return;
      e.preventDefault();
      addImages(files);
    };
    document.addEventListener("paste", handler);
    return () => document.removeEventListener("paste", handler);
  }, [addImages]);

  // Handle drag-and-drop at the window level
  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        addImages(e.dataTransfer.files);
      }
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [addImages]);

  const removeImage = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // ── Input handling ──

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      setInput(val);
      setShowSlash(/^\/\w*$/.test(val));
    },
    []
  );

  const handleSlashSelect = useCallback(
    (name: string, argHint: string) => {
      setInput(`/${name} ${argHint}`);
      setShowSlash(false);
    },
    []
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (/^\/?$/.test(input.trim())) return;
      const text = input.trim();
      if (isRunning) {
        onAbort();
        return;
      }
      if (!text && images.length === 0) return;

      const imageData = images.length > 0
        ? images.map((img) => ({ data: img.data, mimeType: img.mimeType }))
        : undefined;

      setInput("");
      setImages([]);
      setShowSlash(false);
      onSend(text, imageData);
    },
    [input, images, isRunning, onSend, onAbort]
  );

  // ── Render ──

  return (
    <div className="relative border-t border-border bg-background px-4 py-3">
      <form ref={formRef} onSubmit={handleSubmit} className="relative mx-auto max-w-3xl">
        {showSlash && (
          <SlashMenu
            input={input}
            onSelect={handleSlashSelect}
            onClose={() => setShowSlash(false)}
          />
        )}

        {/* Attachment chips (matches pi-web-ui-old's renderAttachments) */}
        {images.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {images.map((img, i) => (
              <div
                key={i}
                className="relative flex items-center gap-1.5 rounded-md border bg-muted/30 p-1 pr-2"
              >
                <img
                  src={img.url}
                  alt="pasted image"
                  className="h-10 w-10 shrink-0 rounded object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full border bg-background text-xs leading-none"
                  aria-label="Remove attachment"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}

        <MessageInput
          value={input}
          onChange={handleInputChange}
          placeholder={
            isRunning
              ? "Agent is running..."
              : "Type a message...  (! for bash, / for commands)"
          }
          isGenerating={isRunning}
          stop={onAbort}
          submitOnEnter={true}
          allowAttachments={false}
          className="border-border bg-muted/30"
        />
      </form>
    </div>
  );
}
