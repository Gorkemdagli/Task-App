import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { transformAvatar } from './media';

async function fixture(format: 'jpeg' | 'png' | 'webp' | 'gif' = 'png') {
  const image = sharp({
    create: { width: 900, height: 600, channels: 3, background: { r: 40, g: 120, b: 200 } },
  });
  return image[format]().toBuffer();
}

describe('media', () => {
  it.each([
    ['jpeg', 'image/jpeg'],
    ['png', 'image/png'],
    ['webp', 'image/webp'],
  ] as const)('accepts %s and returns exact WebP dimensions', async (format, mime) => {
    const output = await transformAvatar(await fixture(format), mime);
    const metadata = await sharp(output).metadata();

    expect(metadata.format).toBe('webp');
    expect(metadata.width).toBe(512);
    expect(metadata.height).toBe(512);
  });

  it('rejects declared MIME mismatch', async () => {
    await expect(transformAvatar(await fixture('png'), 'image/jpeg')).rejects.toMatchObject({
      statusCode: 400,
      code: 'INVALID_IMAGE',
    });
  });

  it('rejects corrupt, SVG, and GIF content', async () => {
    await expect(transformAvatar(Buffer.from('not an image'), 'image/png')).rejects.toMatchObject({
      code: 'INVALID_IMAGE',
    });
    await expect(
      transformAvatar(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/png'),
    ).rejects.toMatchObject({ code: 'INVALID_IMAGE' });
    await expect(transformAvatar(await fixture('gif'), 'image/gif')).rejects.toMatchObject({
      code: 'INVALID_IMAGE',
    });
  });

  it('normalizes EXIF orientation', async () => {
    const oriented = await sharp({
      create: { width: 900, height: 600, channels: 3, background: 'red' },
    })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();

    const output = await transformAvatar(oriented, 'image/jpeg');
    const metadata = await sharp(output).metadata();
    expect(metadata.orientation).toBeUndefined();
    expect(metadata.width).toBe(512);
    expect(metadata.height).toBe(512);
  });
});
