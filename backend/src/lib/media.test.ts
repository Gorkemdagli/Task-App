import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { AVATAR_MAX_INPUT_BYTES, transformAvatar, transformCompanyLogo } from './media';

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

  it.each([
    ['jpeg', 'image/jpeg'],
    ['png', 'image/png'],
    ['webp', 'image/webp'],
  ] as const)(
    'transforms company logo %s inside 1024px without enlargement',
    async (format, mime) => {
      const input = await sharp({
        create: { width: 1800, height: 900, channels: 3, background: 'purple' },
      })
        [format]()
        .toBuffer();

      const output = await transformCompanyLogo(input, mime);
      const metadata = await sharp(output).metadata();

      expect(metadata.format).toBe('webp');
      expect(metadata.width).toBe(1024);
      expect(metadata.height).toBe(512);
    },
  );

  it('does not enlarge small company logos', async () => {
    const input = await fixture('png');
    const output = await transformCompanyLogo(input, 'image/png');
    const metadata = await sharp(output).metadata();

    expect(metadata.width).toBe(900);
    expect(metadata.height).toBe(600);
  });

  it('rejects company logo input above 25 MB', async () => {
    await expect(
      transformCompanyLogo(Buffer.alloc(AVATAR_MAX_INPUT_BYTES + 1), 'image/png'),
    ).rejects.toMatchObject({ statusCode: 413, code: 'FILE_TOO_LARGE' });
  });
});
