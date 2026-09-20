import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaskFile } from '@/hooks/tasks';
import { TaskFilesPanel } from './TaskFilesPanel';

const uploadMock = vi.fn();
const downloadMock = vi.fn();
const deleteMock = vi.fn();
const refetchMock = vi.fn();

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
  useDownloadTaskFile: () => ({ mutate: downloadMock, isPending: false }),
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

  it('uploads a valid file and reports progress while the upload is active', async () => {
    const user = userEvent.setup();
    render(<TaskFilesPanel taskId="task-1" />);
    const input = screen.getByLabelText('Dosya seç');
    const selected = new File(['brief'], 'brief.pdf', { type: 'application/pdf' });

    await user.upload(input, selected);

    expect(uploadMock).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'task-1', file: selected, onUploadProgress: expect.any(Function) }),
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
    const variables = uploadMock.mock.calls[0][0];
    act(() => variables.onUploadProgress({ loaded: 50, total: 100 }));
    expect(screen.getByText('Yükleniyor… %50')).toBeInTheDocument();
    expect(screen.getByLabelText('Dosya seç')).toBeDisabled();
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
    expect(downloadMock).toHaveBeenCalledWith({ taskId: 'task-1', fileId: 'file-1' });
    expect(screen.getByRole('button', { name: 'brief.pdf sil' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'readme.txt sil' })).not.toBeInTheDocument();
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
