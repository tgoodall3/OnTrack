import { useRef, useState } from "react";
import { Loader2, Paperclip, Upload, Trash2, FileText, Image as ImageIcon, Film } from "lucide-react";
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
              className="flex items-center gap-3 rounded-2xl border border-border/60 bg-background px-3 py-2"
            >
              {renderFileTypeIcon(file.type)}
              <div className="min-w-0 flex-1">
                <a
                  href={file.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate text-sm font-semibold text-foreground hover:text-primary"
                >
                  {file.fileName}
                </a>
                <p className="text-[11px] text-muted-foreground">
                  {formatFileSize(file.fileSize)} • {formatRelativeTime(file.createdAt)}
                  {file.uploadedBy?.name || file.uploadedBy?.email
                    ? ` • ${file.uploadedBy.name ?? file.uploadedBy.email ?? ""}`
                    : ""}
                </p>
              </div>
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
              </button>
            </li>
          ))}
        </ul>
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
