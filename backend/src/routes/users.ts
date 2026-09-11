import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { validateBody } from '../middleware/validate';
import {
  authenticatedReadLimiter,
  uploadLimiter,
  writeLimiter,
} from '../middleware/rateLimitProfiles';
import { uploadAvatar, uploadCompanyLogo } from '../middleware/imageUpload';
import { transformCompanyLogo } from '../lib/media';
import { createMediaStorage, deleteOwnedLogo } from '../lib/mediaStorage';
import { requireTenant } from '../lib/permissions';
import { AppError } from '../lib/appError';
import { runTenantRequest } from '../http/runTenantRequest';
import {
  updateCompanyPermissionsSchema,
  updateCurrentUserSchema,
  updateCompanySettingsSchema,
} from '../schemas/users.schema';
import * as companyUsersService from '../services/company-users.service';
import * as companySettingsService from '../services/company-settings.service';
import * as profileService from '../services/profile.service';
import { clearRefreshCookie } from '../lib/cookie';

export const usersRouter = Router();

usersRouter.get('/users/me', requireAuth, authenticatedReadLimiter, async (req, res, next) => {
  try {
    res.json(await profileService.getCurrentProfile(req.user!.id));
  } catch (error) {
    next(error);
  }
});

usersRouter.patch(
  '/users/me',
  requireAuth,
  writeLimiter,
  validateBody(updateCurrentUserSchema),
  async (req, res, next) => {
    try {
      const result = await profileService.updateCurrentProfile(req.user!.id, req.body);
      if (result.sessionRevoked) {
        clearRefreshCookie(res);
        res.json({ sessionRevoked: true });
        return;
      }
      res.json(result.profile);
    } catch (error) {
      next(error);
    }
  },
);

usersRouter.post(
  '/users/me/avatar',
  requireAuth,
  uploadLimiter,
  uploadAvatar,
  async (req, res, next) => {
    try {
      res.json(await profileService.replaceAvatar(req.user!.id, req.file!));
    } catch (error) {
      next(error);
    }
  },
);

usersRouter.use(requireAuth, requireRole(['companyAdmin']));

usersRouter.post(
  '/company/settings/logo',
  uploadLimiter,
  uploadCompanyLogo,
  async (req, res, next) => {
    let uploaded: { path: string; url: string } | undefined;
    let storage: ReturnType<typeof createMediaStorage> | undefined;
    try {
      const tenantId = requireTenant(req.user!);
      if (!req.file?.buffer || !req.file.mimetype) {
        throw new AppError(400, 'Invalid image', 'INVALID_IMAGE');
      }
      storage = createMediaStorage();
      const transformed = await transformCompanyLogo(req.file.buffer, req.file.mimetype);
      uploaded = await storage.uploadLogo(tenantId, transformed);
      const replacement = await runTenantRequest(req, (db, actor) =>
        companySettingsService.replaceCompanyLogo(db, actor, uploaded!.url),
      );
      await deleteOwnedLogo(storage, replacement.previousLogoUrl, tenantId);
      res.json(replacement.settings);
    } catch (error) {
      if (uploaded) {
        try {
          await storage?.deletePath(uploaded.path);
        } catch {
          // New object cleanup is best effort after a database failure.
        }
      }
      next(error);
    }
  },
);

usersRouter.get('/company/settings', authenticatedReadLimiter, async (req, res, next) => {
  try {
    const settings = await runTenantRequest(req, (db, actor) =>
      companySettingsService.getCompanySettings(db, actor),
    );
    res.json(settings);
  } catch (error) {
    next(error);
  }
});

usersRouter.patch(
  '/company/settings',
  writeLimiter,
  validateBody(updateCompanySettingsSchema),
  async (req, res, next) => {
    try {
      const settings = await runTenantRequest(req, (db, actor) =>
        companySettingsService.updateCompanySettings(db, actor, req.body),
      );
      res.json(settings);
    } catch (error) {
      next(error);
    }
  },
);

usersRouter.get('/company/users', authenticatedReadLimiter, async (req, res, next) => {
  try {
    const users = await runTenantRequest(req, (db, actor) =>
      companyUsersService.listCompanyUsers(db, actor),
    );
    res.json(users);
  } catch (error) {
    next(error);
  }
});

usersRouter.patch(
  '/users/:id/permissions',
  writeLimiter,
  validateBody(updateCompanyPermissionsSchema),
  async (req, res, next) => {
    try {
      const user = await runTenantRequest(req, (db, actor) =>
        companyUsersService.updateCompanyPermissions(
          db,
          (req.params as { id: string }).id,
          req.body,
          actor,
        ),
      );
      res.json(user);
    } catch (error) {
      next(error);
    }
  },
);
