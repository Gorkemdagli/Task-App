import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaskFile } from '@/hooks/tasks';
import { TaskFilesPanel } from './TaskFilesPanel';

const uploadMock = vi.fn();
const downloadMock = vi.fn();
const deleteMock = vi.fn();
const refetchMock = vi.fn();
let downloadError: unknown;

let files: TaskFile[] = [];
let filesQuery: {
  data?: { files: TaskFile[] };
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  refetch: typeof refetchMock;
} = {
  data: { files: [] },
  isLoading: false,
  isError: false,
  refetch: refetchMock,
};

vi.mock('@/hooks/tasks', () => ({
  useTaskFiles: () => ({
    ...filesQuery,
    data: filesQuery.data ? { files } : undefined,
  }),
  useUploadTaskFile: () => ({ mutate: uploadMock, isPending: false }),
  useDownloadTaskFile: () => ({ mutate: downloadMock, isPending: false, isError: Boolean(downloadError), error: downloadError }),
  useDeleteTaskFile: () => ({ mutate: deleteMock, isPending: false }),
}));

const file = (overrides: Partial<TaskFile> = {}): TaskFile => ({
  id: 'file-1',
  originalName: 'brief.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 1024,
  createdAt: '2026-09-20T10:00:00.000Z',
  uploader: { id: 'u1', name: 'Ada' },
  canDelete: true,
  ...overrides,
});

describe('TaskFilesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    downloadError = undefined;
    files = [];
    filesQuery = {
      data: { files },
      isLoading: false,
      isError: false,
      refetch: refetchMock,
    };
  });

  it('shows the empty upload state and 25 MB helper text', () => {
    render(<TaskFilesPanel taskId="task-1" />);

    expect(screen.getByText('Henüz dosya yok.')).toBeInTheDocument();
    expect(screen.getByText(/25 MB/)).toBeInTheDocument();
  });

  it('shows a query error recovery state instead of the empty state', async () => {
    filesQuery = {
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('request failed'),
      refetch: refetchMock,
    };
    render(<TaskFilesPanel taskId="task-1" />);
    const user = userEvent.setup();

    expect(screen.getByRole('alert')).toHaveTextContent('Dosyalar yüklenemedi.');
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeInTheDocument();
    expect(screen.queryByText('Henüz dosya yok.')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Tekrar dene' }));
    expect(refetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps file metadata under the name with simplified list headers', () => {
    files = [file()];
    render(<TaskFilesPanel taskId="task-1" />);

    expect(screen.getByText('Ad')).toBeInTheDocument();
    expect(screen.getByText('Ekleyen')).toBeInTheDocument();
    expect(screen.getByText('İşlemler')).toBeInTheDocument();
    expect(screen.queryByText('Tür / Boyut')).not.toBeInTheDocument();
    expect(screen.queryByText('Ekleyen · Tarih')).not.toBeInTheDocument();
    expect(screen.getByText('PDF · 1 KB')).toBeInTheDocument();
    expect(screen.getByText('Ada')).toBeInTheDocument();
  });

  it('fits long file names into the responsive table while keeping the full name accessible', () => {
    const longName = `project-${'x'.repeat(120)}.pdf`;
    files = [file({ originalName: longName })];
    render(<TaskFilesPanel taskId="task-1" />);

    const name = screen.getByText(longName);
    const row = screen.getByTestId('task-file-file-1');
    const grid = row.parentElement?.parentElement;
    expect(name).toHaveAttribute('title', longName);
    expect(name).toHaveTextContent(longName);
    expect(grid).not.toHaveClass('min-w-[520px]');
    expect(grid?.parentElement).not.toHaveClass('overflow-x-auto');
  });

  it('scrolls only the file list while keeping the section header and upload area fixed', () => {
    files = [file()];
    render(<TaskFilesPanel taskId="task-1" />);

    const listScroll = screen.getByTestId('task-files-list-scroll');
    expect(listScroll.querySelector('ul')).toBeInTheDocument();
    expect(listScroll).toContainElement(screen.getByTestId('task-file-file-1'));
    expect(listScroll).not.toContainElement(screen.getByRole('heading', { name: /dosyalar/i }));
    expect(listScroll).not.toContainElement(screen.getByTestId('task-file-dropzone'));
  });

  it('keeps the upload icon inline with its label and helper text below', () => {
    render(<TaskFilesPanel taskId="task-1" />);
    const label = screen.getByText('Dosya ekle').parentElement;

    expect(label).toHaveClass('flex', 'items-center');
    expect(label?.querySelector('svg')).toBeInTheDocument();
    expect(screen.getByText('Dosya başına en fazla 25 MB')).toBeInTheDocument();
  });

  it('stages a valid file, then uploads it after confirmation with progress', async () => {
    const user = userEvent.setup();
    render(<TaskFilesPanel taskId="task-1" />);
    const input = screen.getByLabelText('Dosya seç');
    const selected = new File(['brief'], 'brief.pdf', { type: 'application/pdf' });

    await user.upload(input, selected);

    expect(screen.getByText('Dosya gönderilsin mi?')).toBeInTheDocument();
    expect(screen.getByText('brief.pdf')).toBeInTheDocument();
    expect(uploadMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Gönder' }));
    expect(uploadMock).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'task-1', file: selected, onUploadProgress: expect.any(Function) }),
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
    const variables = uploadMock.mock.calls[0][0];
    act(() => variables.onUploadProgress({ loaded: 50, total: 100 }));
    expect(screen.getByText('Yükleniyor… %50')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yükleniyor…' })).toBeDisabled();
  });

  it('stages a dropped valid file and cancels without uploading', () => {
    render(<TaskFilesPanel taskId="task-1" />);
    const dropzone = screen.getByTestId('task-file-dropzone');
    const selected = new File(['brief'], 'brief.pdf', { type: 'application/pdf' });

    fireEvent.dragEnter(dropzone, { dataTransfer: { files: [selected] } });
    expect(dropzone).toHaveClass('border-primary');

    fireEvent.drop(dropzone, { dataTransfer: { files: [selected] } });
    expect(screen.getByText('Dosya gönderilsin mi?')).toBeInTheDocument();
    expect(uploadMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Vazgeç' }));
    expect(screen.queryByText('Dosya gönderilsin mi?')).not.toBeInTheDocument();
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('rejects invalid type and size before upload', async () => {
    render(<TaskFilesPanel taskId="task-1" />);
    const input = screen.getByLabelText('Dosya seç');

    fireEvent.change(input, {
      target: { files: [new File(['script'], 'script.exe', { type: 'application/octet-stream' })] },
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Bu dosya türü desteklenmiyor.');
    expect(uploadMock).not.toHaveBeenCalled();

    const oversized = new File(['x'], 'large.pdf', { type: 'application/pdf' });
    Object.defineProperty(oversized, 'size', { value: 25 * 1024 * 1024 + 1 });
    fireEvent.change(input, { target: { files: [oversized] } });
    expect(screen.getByRole('alert')).toHaveTextContent('Dosya boyutu 25 MB sınırını aşıyor.');
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('downloads files and hides delete for rows without delete permission', async () => {
    files = [file(), file({ id: 'file-2', originalName: 'readme.txt', canDelete: false })];
    render(<TaskFilesPanel taskId="task-1" />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'brief.pdf indir' }));
    expect(downloadMock).toHaveBeenCalledWith({ taskId: 'task-1', fileId: 'file-1', filename: 'brief.pdf' });
    expect(screen.getByRole('button', { name: 'brief.pdf sil' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'readme.txt sil' })).not.toBeInTheDocument();
  });

  it('shows an accessible error when preparing a file download fails', () => {
    downloadError = new Error('storage unavailable');
    files = [file()];
    render(<TaskFilesPanel taskId="task-1" />);

    expect(screen.getByRole('alert')).toHaveTextContent('Dosya indirilemedi.');
  });

  it('confirms deletion inline, focuses Sil, and closes on Escape', async () => {
    files = [file()];
    render(<TaskFilesPanel taskId="task-1" />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'brief.pdf sil' }));
    expect(screen.getByText('Silinsin mi?')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Sil' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByText('Silinsin mi?')).not.toBeInTheDocument();
  });

  it('keeps the row and shows recovery text when deletion fails', async () => {
    files = [file()];
    deleteMock.mockImplementation((_vars, options) => options.onError?.(new Error('failed')));
    render(<TaskFilesPanel taskId="task-1" />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'brief.pdf sil' }));
    await user.click(screen.getByRole('button', { name: 'Sil' }));

    expect(screen.getByText('brief.pdf')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Dosya silinemedi. Tekrar deneyin.');
  });
});
