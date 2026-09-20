import { useEffect, useId, useRef, useState } from 'react';
import type { AxiosProgressEvent } from 'axios';
import { AlertCircle, Download, FileText, Trash2, UploadCloud } from 'lucide-react';
import {
  useDeleteTaskFile,
  useDownloadTaskFile,
  useTaskFiles,
  useUploadTaskFile,
} from '@/hooks/tasks';
import type { TaskFile } from '@/hooks/tasks';
import { getApiErrorMessage } from '@/lib/apiError';

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const ACCEPTED_FILE_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'text/plain',
  'text/csv',
  'text/markdown',
];

const ACCEPTED_EXTENSIONS = [
  '.pdf',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.zip',
  '.txt',
  '.csv',
  '.md',
].join(',');

function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${Math.round(sizeBytes / 1024)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatFileDate(createdAt: string): string {
  return new Date(createdAt).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Europe/Istanbul',
  });
}

function fileTypeLabel(file: TaskFile): string {
  const extension = file.originalName.includes('.')
    ? file.originalName.slice(file.originalName.lastIndexOf('.') + 1).toUpperCase()
    : file.mimeType.split('/').at(-1)?.toUpperCase() ?? 'DOSYA';
  return `${extension} · ${formatFileSize(file.sizeBytes)}`;
}

function validateFile(file: File): string | null {
  if (file.size > MAX_FILE_BYTES) return 'Dosya boyutu 25 MB sınırını aşıyor.';
  const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  if (!ACCEPTED_FILE_TYPES.includes(file.type.toLowerCase()) || !ACCEPTED_EXTENSIONS.includes(extension)) {
    return 'Bu dosya türü desteklenmiyor.';
  }
  return null;
}

export function TaskFilesPanel({ taskId }: { taskId: string }) {
  const { data, error, isError, isLoading, refetch } = useTaskFiles(taskId);
  const uploadFile = useUploadTaskFile();
  const downloadFile = useDownloadTaskFile();
  const deleteFile = useDeleteTaskFile();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [confirmingFileId, setConfirmingFileId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!confirmingFileId) return;
    confirmButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setConfirmingFileId(null);
        setDeleteError(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmingFileId]);

  const handleFiles = (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) return;
    const validationError = validateFile(file);
    setUploadError(validationError);
    if (validationError) return;

    setUploadProgress(0);
    setIsUploading(true);
    uploadFile.mutate(
      {
        taskId,
        file,
        onUploadProgress: (event: AxiosProgressEvent) => {
          if (event.total) setUploadProgress(Math.round((event.loaded / event.total) * 100));
        },
      },
      {
        onSuccess: () => {
          setIsUploading(false);
          setUploadProgress(null);
          if (inputRef.current) inputRef.current.value = '';
        },
        onError: () => {
          setIsUploading(false);
          setUploadError('Dosya yüklenemedi. Tekrar deneyin.');
        },
      },
    );
  };

  const files = data?.files ?? [];
  const busy = isUploading || uploadFile.isPending;

  return (
    <section aria-labelledby="files-heading" data-testid="task-files-panel">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 id="files-heading" className="text-lg font-semibold">
            Dosyalar
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">Görev bağlamındaki dosyalar</p>
        </div>
        {busy && <span className="text-xs text-primary">Yükleniyor…</span>}
      </div>

      <div
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          handleFiles(event.dataTransfer.files);
        }}
        className="rounded-md border border-dashed border-border bg-muted/30 p-4"
      >
        <div className="flex items-start gap-3">
          <UploadCloud aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Dosya ekle</p>
            <p className="mt-1 text-xs text-muted-foreground">PDF, görsel, Office, ZIP veya metin · 25 MB</p>
          </div>
          <label
            htmlFor={inputId}
            className="inline-flex h-8 shrink-0 cursor-pointer items-center rounded-md border border-border bg-card px-3 text-xs font-medium transition-colors hover:border-primary/60 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary"
          >
            Seç
            <input
              ref={inputRef}
              id={inputId}
              type="file"
              aria-label="Dosya seç"
              accept={ACCEPTED_EXTENSIONS}
              disabled={busy}
              onChange={(event) => handleFiles(event.target.files)}
              className="sr-only"
            />
          </label>
        </div>
        {busy && uploadProgress !== null && (
          <div className="mt-3" aria-live="polite">
            <div className="mb-1 flex justify-between text-xs text-muted-foreground">
              <span>Yükleniyor… %{uploadProgress}</span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
              <div className="h-full bg-primary transition-[width]" style={{ width: `${uploadProgress}%` }} />
            </div>
          </div>
        )}
      </div>

      {(uploadError || deleteError) && (
        <p role="alert" className="mt-3 flex items-start gap-2 text-sm text-destructive">
          <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          {uploadError ?? deleteError}
        </p>
      )}

      {isLoading ? (
        <p className="mt-4 text-sm text-muted-foreground">Dosyalar yükleniyor…</p>
      ) : isError ? (
        <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 p-4">
          <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
            <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            {getApiErrorMessage(error, 'Dosyalar yüklenemedi.')}
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-3 h-8 rounded-md border border-border bg-card px-3 text-xs font-medium transition-colors hover:bg-secondary"
          >
            Tekrar dene
          </button>
        </div>
      ) : files.length === 0 ? (
        <p className="mt-4 text-sm italic text-muted-foreground">Henüz dosya yok.</p>
      ) : (
        <ul className="mt-4 divide-y divide-border" aria-label="Görev dosyaları">
          {files.map((file) => (
            <li key={file.id} className="py-3 first:pt-0 last:pb-0" data-testid={`task-file-${file.id}`}>
              <div className="flex items-start gap-3">
                <FileText aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" title={file.originalName}>
                    {file.originalName}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {fileTypeLabel(file)} · {file.uploader.name} · {formatFileDate(file.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    aria-label={`${file.originalName} indir`}
                    onClick={() => downloadFile.mutate({ taskId, fileId: file.id })}
                    disabled={downloadFile.isPending}
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
                  >
                    <Download aria-hidden="true" className="h-4 w-4" />
                  </button>
                  {file.canDelete && confirmingFileId !== file.id && (
                    <button
                      type="button"
                      aria-label={`${file.originalName} sil`}
                      onClick={() => {
                        setDeleteError(null);
                        setConfirmingFileId(file.id);
                      }}
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 aria-hidden="true" className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
              {confirmingFileId === file.id && (
                <div className="mt-2 flex items-center justify-end gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2">
                  <span className="mr-auto text-xs font-medium">Silinsin mi?</span>
                  <button
                    ref={confirmButtonRef}
                    type="button"
                    onClick={() =>
                      deleteFile.mutate(
                        { taskId, fileId: file.id },
                        {
                          onSuccess: () => setConfirmingFileId(null),
                          onError: () => setDeleteError('Dosya silinemedi. Tekrar deneyin.'),
                        },
                      )
                    }
                    disabled={deleteFile.isPending}
                    className="h-8 rounded-md bg-destructive px-3 text-xs font-medium text-destructive-foreground disabled:opacity-50"
                  >
                    {deleteFile.isPending ? 'Siliniyor…' : 'Sil'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmingFileId(null);
                      setDeleteError(null);
                    }}
                    className="h-8 rounded-md border border-border bg-card px-3 text-xs font-medium"
                  >
                    Vazgeç
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
