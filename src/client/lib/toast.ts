import { toast } from "sonner";

export function showToast(message: string, type: "info" | "success" | "warning" | "error" = "info") {
  toast[type](message);
}

export function showError(message: string) {
  toast.error(message);
}

export function showSuccess(message: string) {
  toast.success(message);
}

export function showInfo(message: string) {
  toast.info(message);
}
