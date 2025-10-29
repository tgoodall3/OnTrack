import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Loader2,
  Paperclip,
  ShieldAlert,
  ShieldCheck,
  Upload,
  Trash2,
  FileText,
  Image as ImageIcon,
  Film,
  X,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import {
  type FileScope,
  type UploadedFileSummary,
  useFileUploadMutations,
  useFiles,
} from "@/hooks/use-files";

type FilesSectionProps = {
  title?: string;
  scope: FileScope;
  entityLabel: string;
  emptyState?: string;
};

const ACCEPTED_FILE_TYPES =
  "image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.txt";

export function FilesSection({
  title = "Files & Photos",
  scope,
  entityLabel,
  emptyState = "No files yet. Upload documents or photos to keep everyone aligned.",
}: FilesSectionProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<UploadedFileSummary | null>(null);

  const { data: files, isLoading, error } = useFiles(scope);
  const { uploadRequestMutation, finalizeMutation, deleteMutation } = useFileUploadMutations(scope);

  const isUploading = uploading || uploadRequestMutation.isPending || finalizeMutation.isPending;
  const items = files ?? [];

  const handleFileSelection = async (file: File) => {
    if (!file) return;

    const mimeType = file.type || "application/octet-stream";

    try {
      setUploading(true);
      const upload = await uploadRequestMutation.mutateAsync({
        ...scope,
        fileName: file.name,
        mimeType,
        fileSize: file.size,
      });

      const response = await fetch(upload.uploadUrl, {
        method: "PUT",
        body: file,
        headers: {
          ...upload.headers,
          "Content-Type": mimeType,
        },
      });

      if (!response.ok) {
        throw new Error(`Storage upload failed (${response.status})`);
      }

      await finalizeMutation.mutateAsync({
        ...scope,
        key: upload.key,
        fileName: file.name,
        mimeType,
        fileSize: file.size,
      });

      toast({
        variant: "success",
        title: "File uploaded",
        description: `${file.name} is now attached to ${entityLabel}.`,
      });
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : "Unable to upload file.";
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: message,
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      void handleFileSelection(selectedFile);
    }
  };

  const handleDelete = async (file: UploadedFileSummary) => {
    const confirmed = window.confirm(`Remove ${file.fileName}? This action cannot be undone.`);
    if (!confirmed) return;

    try {
      setDeletingId(file.id);
      await deleteMutation.mutateAsync({ ...scope, fileId: file.id });
      toast({
        variant: "success",
        title: "File removed",
        description: `${file.fileName} deleted.`,
      });
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "Unable to delete file.";
      toast({
        variant: "destructive",
        title: "Remove failed",
        description: message,
      });
    } finally {
      setDeletingId(null);
    }
  };

  const showScanStatusToast = (file: UploadedFileSummary) => {
    switch (file.scanStatus) {
      case "PENDING":
        toast({
          title: "Scan in progress",
          description: file.scanMessage ?? "We are scanning this file for threats. Try again shortly.",
        });
        break;
      case "INFECTED":
        toast({
          variant: "destructive",
          title: "Access blocked",
          description: file.scanMessage ?? "Potential malware detected. Download and preview are disabled.",
        });
        break;
      case "FAILED":
        toast({
          variant: "destructive",
          title: "Scan failed",
          description: file.scanMessage ?? "We could not verify this file. Re-upload or contact your admin.",
        });
        break;
      default:
        break;
    }
  };

  const handleOpenLink = (event: ReactMouseEvent<HTMLAnchorElement>, file: UploadedFileSummary) => {
    if (file.scanStatus !== "CLEAN" || file.isProcessing) {
      event.preventDefault();
      showScanStatusToast(file);
    }
  };

  return (
    <section className="rounded-2xl border border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Paperclip className="h-3 w-3 text-primary" aria-hidden="true" />
          {title}
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleInputChange}
            accept={ACCEPTED_FILE_TYPES}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-primary hover:text-primary disabled:opacity-60"
            disabled={isUploading}
          >
            {isUploading ? (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            ) : (
              <Upload className="h-3 w-3" aria-hidden="true" />
            )}
            Upload file
          </button>
        </div>
      </header>
      {error ? (
        <div className="rounded-2xl border border-accent/40 bg-accent/15 px-3 py-2 text-xs text-accent-foreground">
          {error.message}
        </div>
      ) : isLoading ? (
        <div className="space-y-2">
          <div className="h-10 rounded-2xl bg-muted/40 animate-pulse" />
          <div className="h-10 rounded-2xl bg-muted/40 animate-pulse" />
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border/60 bg-background/60 px-3 py-3 text-xs">
          {emptyState}
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((file) => (
            <li
              key={file.id}
              className="flex items-center gap-3 rounded-2xl border border-border/60 bg-background px-3 py-3"
            >
              <div className="flex items-center justify-center">
                {renderFilePreview(file)}
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <a
                  href={file.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(event) => handleOpenLink(event, file)}
                  aria-disabled={file.scanStatus !== "CLEAN" || file.isProcessing}
                  className="block truncate text-sm font-semibold text-foreground hover:text-primary disabled:pointer-events-none disabled:text-muted-foreground"
                >
                  {file.fileName}
                </a>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  <FileTypeBadge type={file.type} />
                  <span>{formatFileSize(file.fileSize)}</span>
                  <span>{formatRelativeTime(file.createdAt)}</span>
                  {file.uploadedBy?.name || file.uploadedBy?.email ? (
                    <span>Uploaded by {file.uploadedBy.name ?? file.uploadedBy.email ?? ""}</span>
                  ) : null}
                  <ScanStatusBadge file={file} />
                </div>
                {renderScanStatusMessage(file)}
              </div>
              <div className="flex flex-col items-end gap-2">
                <button
                  type="button"
                  onClick={() => void handleDelete(file)}
                  className="inline-flex items-center rounded-full border border-border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-accent hover:text-accent disabled:opacity-60"
                  disabled={deletingId === file.id || deleteMutation.isPending}
                >
                  {deletingId === file.id || deleteMutation.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                  ) : (
                    <Trash2 className="h-3 w-3" aria-hidden="true" />
                  )}
                  Remove
                </button>
                {file.type === "IMAGE" && (
                  <button
                    type="button"
                    onClick={() => {
                      if (file.scanStatus !== "CLEAN" || file.isProcessing) {
                        showScanStatusToast(file);
                        return;
                      }
                      setPreviewFile(file);
                    }}
                    className="inline-flex items-center rounded-full border border-border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-primary hover:text-primary disabled:opacity-50"
                    disabled={file.scanStatus !== "CLEAN" || file.isProcessing}
                    title={getPreviewTooltip(file)}
                  >
                    Preview
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {previewFile && (
        <ImagePreviewOverlay file={previewFile} onClose={() => setPreviewFile(null)} />
      )}
    </section>
  );
}

function renderFileTypeIcon(type: UploadedFileSummary["type"]) {
  switch (type) {
    case "IMAGE":
      return <ImageIcon className="h-5 w-5 text-primary" aria-hidden="true" />;
    case "VIDEO":
      return <Film className="h-5 w-5 text-primary" aria-hidden="true" />;
    case "DOCUMENT":
      return <FileText className="h-5 w-5 text-primary" aria-hidden="true" />;
    default:
      return <Paperclip className="h-5 w-5 text-primary" aria-hidden="true" />;
  }
}

function renderFilePreview(file: UploadedFileSummary) {
  const isImage = file.type === "IMAGE";
  const basePreview = isImage ? (
    <img src={file.url} alt={file.fileName} className="h-full w-full object-cover" loading="lazy" />
  ) : (
    <div className="flex h-full w-full items-center justify-center bg-muted/30">{renderFileTypeIcon(file.type)}</div>
  );

  return (
    <div className="relative h-16 w-16 overflow-hidden rounded-xl border border-border/60 bg-muted/20">
      {basePreview}
      {file.scanStatus === "PENDING" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-background/80 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
          Scanning
        </div>
      )}
      {file.scanStatus === "INFECTED" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-red-900/85 text-[10px] font-semibold uppercase tracking-wide text-red-100">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          Quarantined
        </div>
      )}
      {file.scanStatus === "FAILED" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-amber-900/80 text-[10px] font-semibold uppercase tracking-wide text-amber-100">
          <ShieldAlert className="h-4 w-4" aria-hidden="true" />
          Scan failed
        </div>
      )}
    </div>
  );
}

function FileTypeBadge({ type }: { type: UploadedFileSummary["type"] }) {
  switch (type) {
    case "IMAGE":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-semibold uppercase tracking-wide text-primary">
          <ImageIcon className="h-3 w-3" aria-hidden="true" />
          Photo
        </span>
      );
    case "VIDEO":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-semibold uppercase tracking-wide text-primary">
          <Film className="h-3 w-3" aria-hidden="true" />
          Video
        </span>
      );
    case "DOCUMENT":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-semibold uppercase tracking-wide text-primary">
          <FileText className="h-3 w-3" aria-hidden="true" />
          Document
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-semibold uppercase tracking-wide text-primary">
          <Paperclip className="h-3 w-3" aria-hidden="true" />
          File
        </span>
      );
  }
}

function ScanStatusBadge({ file }: { file: UploadedFileSummary }) {
  const meta = getScanStatusMeta(file.scanStatus);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold uppercase tracking-wide ${meta.className}`}
    >
      {meta.icon}
      {meta.label}
    </span>
  );
}

function renderScanStatusMessage(file: UploadedFileSummary) {
  if (file.scanStatus === "CLEAN" && !file.scanMessage) {
    return null;
  }

  const defaults: Record<UploadedFileSummary["scanStatus"], string> = {
    CLEAN: "Scan complete.",
    PENDING: "Scan in progress. This may take a moment.",
    INFECTED: "This file has been quarantined after a threat was detected.",
    FAILED: "Scan failed. Re-upload the file or contact support.",
  };

  const tones: Record<UploadedFileSummary["scanStatus"], string> = {
    CLEAN: "text-emerald-600",
    PENDING: "text-amber-600",
    INFECTED: "text-red-600",
    FAILED: "text-amber-600",
  };

  return (
    <p className={`text-[11px] font-semibold ${tones[file.scanStatus]}`}>
      {file.scanMessage ?? defaults[file.scanStatus]}
    </p>
  );
}

function getScanStatusMeta(status: UploadedFileSummary["scanStatus"]) {
  switch (status) {
    case "CLEAN":
      return {
        label: "Scanned",
        className: "border-emerald-200 bg-emerald-100 text-emerald-700",
        icon: <ShieldCheck className="h-3 w-3" aria-hidden="true" />,
      };
    case "INFECTED":
      return {
        label: "Quarantined",
        className: "border-red-200 bg-red-100 text-red-700",
        icon: <AlertTriangle className="h-3 w-3" aria-hidden="true" />,
      };
    case "FAILED":
      return {
        label: "Scan failed",
        className: "border-amber-200 bg-amber-100 text-amber-700",
        icon: <ShieldAlert className="h-3 w-3" aria-hidden="true" />,
      };
    default:
      return {
        label: "Scanning",
        className: "border-amber-200 bg-amber-100 text-amber-700",
        icon: <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />,
      };
  }
}

function getPreviewTooltip(file: UploadedFileSummary): string | undefined {
  if (file.scanStatus === "CLEAN" && !file.isProcessing) {
    return undefined;
  }

  if (file.scanStatus === "PENDING" || file.isProcessing) {
    return "Preview available once scanning completes.";
  }

  if (file.scanStatus === "INFECTED") {
    return "Preview blocked until the file is replaced.";
  }

  if (file.scanStatus === "FAILED") {
    return "Preview unavailable while the scan is unresolved.";
  }

  return "Preview unavailable.";
}

function formatFileSize(bytes?: number | null): string {
  if (!bytes || bytes <= 0) {
    return "Unknown size";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }
  const mb = kb / 1024;
  if (mb < 1024) {
    return `${mb.toFixed(1)} MB`;
  }
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
}

function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const target = new Date(iso).getTime();
  const diffMs = now - target;

  const minutes = Math.round(diffMs / (1000 * 60));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;

  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;

  const months = Math.round(days / 30);
  if (months < 12) return `${months} mo${months === 1 ? "" : "s"} ago`;

  const years = Math.round(months / 12);
  return `${years} yr${years === 1 ? "" : "s"} ago`;
}

function ImagePreviewOverlay({ file, onClose }: { file: UploadedFileSummary; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [mounted, onClose]);

  if (!mounted || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[1200] flex items-center justify-center bg-background/90 px-4 py-8 backdrop-blur"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative w-full max-w-3xl rounded-3xl border border-border/70 bg-surface p-6 shadow-2xl shadow-primary/20"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full border border-border/70 p-1.5 text-muted-foreground transition hover:border-primary hover:text-primary"
          aria-label="Close preview"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
        <div className="grid gap-4 md:grid-cols-[2fr,1fr] md:items-start">
          <div className="flex items-center justify-center rounded-2xl border border-border/60 bg-muted/20 p-4">
            <img
              src={file.url}
              alt={file.fileName}
              className="max-h-[70vh] w-full rounded-xl object-contain"
              loading="lazy"
            />
          </div>
          <div className="space-y-3 text-sm text-muted-foreground">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/80">File name</p>
              <p className="truncate text-base font-semibold text-foreground">{file.fileName}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
              <FileTypeBadge type={file.type} />
              <span>{formatFileSize(file.fileSize)}</span>
              <span>{formatRelativeTime(file.createdAt)}</span>
            </div>
            {file.uploadedBy?.name || file.uploadedBy?.email ? (
              <p className="text-xs text-muted-foreground/80">
                Uploaded by{" "}
                <span className="font-semibold text-foreground">{file.uploadedBy.name ?? file.uploadedBy.email ?? ""}</span>
              </p>
            ) : null}
            <a
              href={file.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-primary hover:text-primary"
            >
              Open in new tab
            </a>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
