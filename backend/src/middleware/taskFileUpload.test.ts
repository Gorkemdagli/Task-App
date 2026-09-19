import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandler } from './errorHandler';
import { TASK_FILE_MAX_BYTES, uploadTaskFile } from './taskFileUpload';

function createUploadApp() {
  const app = express();
  app.post('/upload', uploadTaskFile, (req, res) => {
    res.json({
      ok: true,
      file: req.file && {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
      },
    });
  });
  app.use(errorHandler);
  return app;
}

const oleSignature = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const zipSignature = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);

const validFiles: ReadonlyArray<[string, string, string, Buffer]> = [
  ['PDF', 'task.pdf', 'application/pdf', Buffer.from('%PDF-1.7\n')],
  ['JPEG', 'task.jpg', 'image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0])],
  ['PNG', 'task.png', 'image/png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
  ['WebP', 'task.webp', 'image/webp', Buffer.from('RIFF1234WEBP')],
  ['GIF', 'task.gif', 'image/gif', Buffer.from('GIF89a')],
  ['Word', 'task.doc', 'application/msword', oleSignature],
  ['Word OpenXML', 'task.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', zipSignature],
  ['Excel', 'task.xls', 'application/vnd.ms-excel', oleSignature],
  ['Excel OpenXML', 'task.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', zipSignature],
  ['PowerPoint', 'task.ppt', 'application/vnd.ms-powerpoint', oleSignature],
  ['PowerPoint OpenXML', 'task.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', zipSignature],
  ['ZIP', 'task.zip', 'application/zip', zipSignature],
  ['text', 'task.txt', 'text/plain', Buffer.from('plain text')],
  ['CSV', 'task.csv', 'text/csv', Buffer.from('name,value\n')],
  ['Markdown', 'task.md', 'text/markdown', Buffer.from('# Task\n')],
];

describe('uploadTaskFile', () => {
  it('accepts the route-shaped single PDF multipart request', async () => {
    const response = await request(createUploadApp())
      .post('/upload')
      .attach('file', Buffer.from('%PDF-1.7\n'), {
        filename: 'route-report.pdf',
        contentType: 'application/pdf',
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      ok: true,
      file: { originalname: 'route-report.pdf', mimetype: 'application/pdf' },
    });
  });

  it.each(validFiles)('accepts a valid %s extension/MIME/signature pair', async (_label, filename, contentType, body) => {
    const response = await request(createUploadApp())
      .post('/upload')
      .attach('file', body, { filename, contentType });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ ok: true, file: { originalname: filename, mimetype: contentType } });
  });

  it.each([
    ['SVG', 'task.svg', 'image/svg+xml', Buffer.from('<svg />')],
    ['executable extension', 'task.exe', 'application/octet-stream', Buffer.from('MZ')],
    ['PDF extension with image MIME', 'task.pdf', 'image/png', Buffer.from('%PDF-1.7')],
    ['DOCX MIME with executable extension', 'task.exe', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', zipSignature],
    ['DOCX extension with ZIP MIME', 'task.docx', 'application/zip', zipSignature],
    ['ZIP extension with DOCX MIME', 'task.zip', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', zipSignature],
    ['PDF MIME with an image signature', 'task.pdf', 'application/pdf', Buffer.from([0x89, 0x50, 0x4e, 0x47])],
    ['DOCX MIME with a non-ZIP signature', 'task.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', Buffer.from('not a zip')],
  ] as const)('rejects %s', async (_label, filename, contentType, body) => {
    const response = await request(createUploadApp())
      .post('/upload')
      .attach('file', body, { filename, contentType });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_FILE');
  });

  it('rejects a missing file', async () => {
    const response = await request(createUploadApp()).post('/upload');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('FILE_REQUIRED');
  });

  it('rejects excess multipart fields through the invalid file error path', async () => {
    const response = await request(createUploadApp())
      .post('/upload')
      .field('extra', 'value')
      .attach('file', Buffer.from('%PDF-1.7\n'), {
        filename: 'task.pdf',
        contentType: 'application/pdf',
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_FILE');
  });

  it('rejects files larger than 25 MB after buffering limits are applied', async () => {
    const response = await request(createUploadApp())
      .post('/upload')
      .attach('file', Buffer.alloc(TASK_FILE_MAX_BYTES + 1), {
        filename: 'large.txt',
        contentType: 'text/plain',
      });

    expect(response.status).toBe(413);
    expect(response.body.error).toBe('FILE_TOO_LARGE');
  });
});
