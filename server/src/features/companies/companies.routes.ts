import { Router } from 'express';
import { ok } from '@cosmo/shared';
import { asyncHandler } from '../../middleware/errorHandler';
import { requireAuth, AuthedRequest } from '../../middleware/auth';
import * as companiesService from './companies.service';

export const companiesRouter = Router();

companiesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(60, Math.max(1, Number(req.query.limit) || 24));
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const result = await companiesService.listCompanies({ q, page, limit });
    res.json(ok(result));
  })
);

companiesRouter.get(
  '/:key/jobs',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const key = typeof req.params.key === 'string' ? req.params.key : '';
    if (!key) {
      res.status(400).json({ success: false, message: 'Missing company key' });
      return;
    }
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(60, Math.max(1, Number(req.query.limit) || 24));
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const result = await companiesService.listCompanyJobs(key, {
      q,
      page,
      limit,
    });
    if (!result) {
      res.status(404).json({ success: false, message: 'Company not found' });
      return;
    }
    res.json(ok(result));
  })
);

companiesRouter.get(
  '/:key',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const key = typeof req.params.key === 'string' ? req.params.key : '';
    if (!key) {
      res.status(400).json({ success: false, message: 'Missing company key' });
      return;
    }
    const company = await companiesService.getCompany(key);
    if (!company) {
      res.status(404).json({ success: false, message: 'Company not found' });
      return;
    }
    res.json(ok(company));
  })
);
