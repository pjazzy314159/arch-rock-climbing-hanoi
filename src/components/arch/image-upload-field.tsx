import { useEffect, useId, useRef, useState } from "react";
import { AlertCircle, Loader2, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { adminApi } from "@/services/api";
import { useHydrated } from "@/hooks/use-hydrated";

interface ImageUploadFieldProps {
  /** Current image URL value */
  value: string;
  /** Callback when image URL changes */
  onChange: (url: string) => void;
  /** Whether the field is disabled */
  disabled?: boolean;
  /** Label for the field */
  label?: string;
  /** Placeholder for the URL input */
  placeholder?: string;
  /** Accepted file types */
  accept?: string;
  /** Maximum file size in bytes (default: 10MB) */
  maxSize?: number;
  /** Custom error message handler */
  onError?: (message: string) => void;
  /** Custom success handler */
  onSuccess?: (url: string) => void;
}

export function ImageUploadField({
  value,
  onChange,
  disabled = false,
  label = "Image",
  placeholder = "https://example.com/image.jpg",
  accept = "image/jpeg,image/png,image/webp",
  maxSize = 10 * 1024 * 1024, // 10MB
  onError,
  onSuccess,
}: ImageUploadFieldProps) {
  const fileInputId = useId();
  const urlInputId = useId();
  const helpId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hydrated = useHydrated();

  // Release the temporary object URL when it is replaced or unmounted.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const resetSelection = () => {
    setFile(null);
    setPreviewUrl(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (!selected) return;

    setError(null);

    // Validate the file type before it reaches the server. The server still
    // validates the actual bytes; this only avoids a pointless upload.
    const allowed = accept.split(",").some((type) => {
      const trimmed = type.trim();
      return trimmed.endsWith("/*")
        ? selected.type.startsWith(trimmed.slice(0, -1))
        : selected.type === trimmed;
    });
    if (!allowed) {
      const msg = "Unsupported file type";
      setError(msg);
      onError?.(msg);
      event.target.value = "";
      return;
    }

    if (selected.size > maxSize) {
      const msg = "File too large";
      setError(msg);
      onError?.(msg);
      event.target.value = "";
      return;
    }

    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
  };

  const handleUpload = async () => {
    if (!file || loading) return;

    setLoading(true);
    setError(null);

    try {
      const stored = await adminApi.uploadImage(file);
      // The previous URL is only replaced once the server has confirmed the
      // upload and returned a real public URL.
      onChange(stored.url);
      onSuccess?.(stored.url);
      resetSelection();
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "The image could not be uploaded.";
      // Deliberately do not touch `value`: a failed upload must preserve the
      // image that was already attached to the record.
      setError(message);
      onError?.(message);
    } finally {
      setLoading(false);
    }
  };

  const handleUrlChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.value);
    if (file) resetSelection();
  };

  const submitDisabled = !hydrated || loading || !file || disabled;

  return (
    <div className="image-upload-field">
      <Label htmlFor={fileInputId}>
        {label} <span className="label-hint">optional</span>
      </Label>

      {(value || previewUrl) && (
        <div className="image-preview">
          <img
            src={previewUrl || value}
            alt="Current image"
            onError={() => {
              // A broken remote image should not break the form.
            }}
          />
          <span className="image-preview-overlay">
            <span className="preview-badge">Current</span>
          </span>
        </div>
      )}

      <Input
        ref={fileInputRef}
        id={fileInputId}
        type="file"
        accept={accept}
        onChange={handleFileSelect}
        disabled={disabled || loading}
        aria-describedby={helpId}
        className="file-input"
      />

      {file && (
        <div className="file-name-display">
          <span>{file.name}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={resetSelection}
            disabled={loading || disabled}
            aria-label="Remove selected file"
          >
            <X size={14} />
          </Button>
        </div>
      )}

      {file && (
        <Button
          type="button"
          variant="secondary"
          onClick={handleUpload}
          disabled={submitDisabled}
          className="upload-btn"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Uploading...
            </>
          ) : (
            <>
              <Upload size={14} /> Upload
            </>
          )}
        </Button>
      )}

      <div className="url-fallback">
        <Label htmlFor={urlInputId} className="url-fallback-label">
          Or enter URL manually:
        </Label>
        <Input
          id={urlInputId}
          type="url"
          value={value}
          onChange={handleUrlChange}
          placeholder={placeholder}
          disabled={disabled || loading}
          maxLength={400}
        />
      </div>

      {error && (
        <p className="feedback error" role="alert">
          <AlertCircle size={14} /> {error}
        </p>
      )}

      <p className="auth-note" id={helpId}>
        Supported formats: JPEG, PNG, WebP. Max size: {(maxSize / (1024 * 1024)).toFixed(1)} MB.
      </p>
    </div>
  );
}
