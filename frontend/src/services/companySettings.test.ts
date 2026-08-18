import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import {
  getCompanySettings,
  updateCompanySettings,
  uploadCompanyLogo,
  type CompanySettings,
} from './companySettings';

const settings: CompanySettings = {
  id: 'tenant-a',
  name: 'Acme Corp',
  slug: 'acme-corp',
  description: null,
  logoUrl: null,
};

describe('company settings service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('gets company settings', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: settings } as never);

    await expect(getCompanySettings()).resolves.toEqual(settings);
    expect(get).toHaveBeenCalledWith('/company/settings');
  });

  it('updates company settings as JSON', async () => {
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({ data: settings } as never);

    await updateCompanySettings({ name: 'Updated' });

    expect(patch).toHaveBeenCalledWith('/company/settings', { name: 'Updated' });
  });

  it('uploads logo as multipart field logo', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: settings } as never);
    const file = new File(['logo'], 'logo.png', { type: 'image/png' });

    await uploadCompanyLogo(file);

    expect(post).toHaveBeenCalledTimes(1);
    const form = post.mock.calls[0][1] as FormData;
    expect(form.get('logo')).toBe(file);
  });
});
