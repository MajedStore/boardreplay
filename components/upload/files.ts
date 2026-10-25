import type { DragEvent } from "react";

export function photoValidationError(files: File[], existingCount = 0) {
  if (files.some((file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type))) {
    return "Choose JPG, PNG, or WebP photos.";
  }
  if (files.some((file) => file.size > 10 * 1024 * 1024)) {
    return "Each photo must be 10 MB or smaller.";
  }
  if (files.reduce((total, file) => total + file.size, 0) > 100 * 1024 * 1024) {
    return "Choose up to 100 MB of photos at a time.";
  }
  if (files.length + existingCount > 20) {
    return "A lesson can contain up to 20 photos.";
  }
  return "";
}

export function hasPhotoFiles(event: DragEvent) {
  return Array.from(event.dataTransfer.types).includes("Files");
}
