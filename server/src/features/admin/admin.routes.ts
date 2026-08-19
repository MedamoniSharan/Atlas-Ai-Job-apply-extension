import { Router } from 'express';
import {
  adminAuditQuerySchema,
  adminCreateCouponSchema,
  adminCreateSiteOfferSchema,
  adminCreateSiteBannerSchema,
  adminExtendSubscriptionSchema,
  adminMetricsQuerySchema,
  adminPatchUserSchema,
  adminPaymentsQuerySchema,
  adminSetPlanSchema,
  adminSubscriptionsQuerySchema,
  adminUninstallFeedbackQuerySchema,
  adminUpdateCouponSchema,
  adminUpdatePlanSchema,
  adminUpdateSiteOfferSchema,
  adminUpdateSiteBannerSchema,
  adminUsersQuerySchema,
  ok,
  planTierSchema,
} from '@cosmo/shared';
import { asyncHandler, AppError } from '../../middleware/errorHandler';
import {
  AuthedRequest,
  requireAuth,
  requireAdmin,
} from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import * as adminService from './admin.service';
import * as billingService from '../billing/billing.service';
import * as couponService from '../billing/coupon.service';
import * as feedbackService from '../feedback/feedback.service';
import * as offerService from '../billing/offer.service';
import * as bannerService from '../billing/banner.service';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin, adminService.adminRateLimit);

function clientIp(req: AuthedRequest): string | undefined {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length) return xf.split(',')[0]?.trim();
  return req.ip;
}

adminRouter.get(
  '/metrics',
  asyncHandler(async (req: AuthedRequest, res) => {
    const parsed = adminMetricsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError('Validation failed', 400, 'VALIDATION_ERROR');
    }
    const data = await adminService.getMetrics(parsed.data);
    res.json(ok(data));
  })
);

adminRouter.get(
  '/metrics/day-detail',
  asyncHandler(async (req: AuthedRequest, res) => {
    const date = String(req.query.date ?? '');
    if (!/^\d{4}-\d{2}(-\d{2})?$/.test(date)) {
      throw new AppError('Invalid date. Expected YYYY-MM-DD', 400, 'VALIDATION_ERROR');
    }
    const data = await adminService.getDayDetail(date);
    res.json(ok(data));
  })
);

adminRouter.get(
  '/users',
  asyncHandler(async (req: AuthedRequest, res) => {
    const parsed = adminUsersQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError('Validation failed', 400, 'VALIDATION_ERROR');
    }
    const data = await adminService.listUsers(parsed.data);
    res.json(ok(data));
  })
);

adminRouter.get(
  '/users/:id',
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = await adminService.getUser(String(req.params.id));
    res.json(ok(data));
  })
);

adminRouter.patch(
  '/users/:id',
  validateBody(adminPatchUserSchema),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = await adminService.patchUser(
      req.user!.sub,
      String(req.params.id),
      req.body,
      clientIp(req)
    );
    res.json(ok(data, 'User updated'));
  })
);

adminRouter.delete(
  '/users/:id',
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = await adminService.deleteUser(
      req.user!.sub,
      String(req.params.id),
      clientIp(req)
    );
    res.json(ok(data, 'User deleted'));
  })
);

adminRouter.post(
  '/users/:id/plan',
  validateBody(adminSetPlanSchema),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = await adminService.setUserPlan(
      req.user!.sub,
      String(req.params.id),
      req.body,
      clientIp(req)
    );
    res.json(ok(data, 'Plan updated'));
  })
);

adminRouter.post(
  '/users/:id/suspend',
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = await adminService.patchUser(
      req.user!.sub,
      String(req.params.id),
      { status: 'suspended' },
      clientIp(req)
    );
    res.json(ok(data, 'User suspended'));
  })
);

adminRouter.post(
  '/users/:id/unsuspend',
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = await adminService.patchUser(
      req.user!.sub,
      String(req.params.id),
      { status: 'active' },
      clientIp(req)
    );
    res.json(ok(data, 'User unsuspended'));
  })
);

adminRouter.post(
  '/users/:id/impersonate',
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = await adminService.impersonateUser(
      req.user!.sub,
      String(req.params.id),
      clientIp(req)
    );
    res.json(ok(data, 'Impersonation started'));
  })
);

adminRouter.get(
  '/subscriptions',
  asyncHandler(async (req: AuthedRequest, res) => {
    const parsed = adminSubscriptionsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError('Validation failed', 400, 'VALIDATION_ERROR');
    }
    const data = await adminService.listSubscriptions(parsed.data);
    res.json(ok(data));
  })
);

adminRouter.post(
  '/subscriptions/:id/cancel',
  asyncHandler(async (req: AuthedRequest, res) => {
    const immediate = String(req.query.immediate ?? '') === '1';
    const data = await adminService.cancelSubscriptionAdmin(
      req.user!.sub,
      String(req.params.id),
      immediate,
      clientIp(req)
    );
    res.json(ok(data, 'Subscription cancelled'));
  })
);

adminRouter.post(
  '/subscriptions/:id/extend',
  validateBody(adminExtendSubscriptionSchema),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = await adminService.extendSubscriptionAdmin(
      req.user!.sub,
      String(req.params.id),
      req.body,
      clientIp(req)
    );
    res.json(ok(data, 'Subscription extended'));
  })
);

adminRouter.get(
  '/payments',
  asyncHandler(async (req: AuthedRequest, res) => {
    const parsed = adminPaymentsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError('Validation failed', 400, 'VALIDATION_ERROR');
    }
    const data = await adminService.listPayments(parsed.data);
    res.json(ok(data));
  })
);

adminRouter.post(
  '/payments/:id/reconcile',
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = await adminService.reconcilePayment(
      req.user!.sub,
      String(req.params.id),
      clientIp(req)
    );
    res.json(ok(data, 'Payment reconciled'));
  })
);

adminRouter.get(
  '/payments/:id/invoice',
  asyncHandler(async (req: AuthedRequest, res) => {
    const { absolutePath, filename } =
      await billingService.getInvoiceStreamAdmin(String(req.params.id));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${filename}"`
    );
    res.sendFile(absolutePath);
  })
);

adminRouter.get(
  '/plans',
  asyncHandler(async (_req, res) => {
    const data = await adminService.listPlans();
    res.json(ok(data));
  })
);

adminRouter.patch(
  '/plans/:tier',
  validateBody(adminUpdatePlanSchema),
  asyncHandler(async (req: AuthedRequest, res) => {
    const tierParsed = planTierSchema.safeParse(req.params.tier);
    if (!tierParsed.success) {
      throw new AppError('Invalid plan tier', 400, 'VALIDATION_ERROR');
    }
    const data = await adminService.updatePlan(
      req.user!.sub,
      tierParsed.data,
      req.body,
      clientIp(req)
    );
    res.json(ok(data, 'Plan updated'));
  })
);

adminRouter.get(
  '/offers',
  asyncHandler(async (_req, res) => {
    const data = await offerService.listOffersAdmin();
    res.json(ok(data));
  })
);

adminRouter.post(
  '/offers',
  validateBody(adminCreateSiteOfferSchema),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = await offerService.createOffer(req.body);
    res.status(201).json(ok(data, 'Offer created'));
  })
);

adminRouter.patch(
  '/offers/:id',
  validateBody(adminUpdateSiteOfferSchema),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = await offerService.updateOffer(
      String(req.params.id),
      req.body
    );
    res.json(ok(data, 'Offer updated'));
  })
);

adminRouter.delete(
  '/offers/:id',
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = await offerService.deleteOffer(String(req.params.id));
    res.json(ok(data, 'Offer deleted'));
  })
);

adminRouter.get(
  '/banners',
  asyncHandler(async (_req, res) => {
    const data = await bannerService.listBannersAdmin();
    res.json(ok(data));
  })
);

adminRouter.post(
  '/banners',
  validateBody(adminCreateSiteBannerSchema),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = await bannerService.createBanner(req.body);
    res.status(201).json(ok(data, 'Banner created'));
  })
);

adminRouter.patch(
  '/banners/:id',
  validateBody(adminUpdateSiteBannerSchema),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = await bannerService.updateBanner(
      String(req.params.id),
      req.body
    );
    res.json(ok(data, 'Banner updated'));
  })
);

adminRouter.delete(
  '/banners/:id',
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = await bannerService.deleteBanner(String(req.params.id));
    res.json(ok(data, 'Banner deleted'));
  })
);

adminRouter.get(
  '/coupons',
  asyncHandler(async (_req, res) => {
    const data = await couponService.listCouponsAdmin();
    res.json(ok(data));
  })
);

adminRouter.post(
  '/coupons',
  validateBody(adminCreateCouponSchema),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = await couponService.createCoupon(req.body);
    res.status(201).json(ok(data, 'Coupon created'));
  })
);

adminRouter.patch(
  '/coupons/:code',
  validateBody(adminUpdateCouponSchema),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = await couponService.updateCoupon(
      String(req.params.code),
      req.body
    );
    res.json(ok(data, 'Coupon updated'));
  })
);

adminRouter.delete(
  '/coupons/:code',
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = await couponService.deleteCoupon(String(req.params.code));
    res.json(ok(data, 'Coupon deleted'));
  })
);

adminRouter.get(
  '/audit',
  asyncHandler(async (req: AuthedRequest, res) => {
    const parsed = adminAuditQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError('Validation failed', 400, 'VALIDATION_ERROR');
    }
    const data = await adminService.listAudit(
      parsed.data.page,
      parsed.data.limit
    );
    res.json(ok(data));
  })
);

adminRouter.get(
  '/feedback/uninstall',
  asyncHandler(async (req: AuthedRequest, res) => {
    const parsed = adminUninstallFeedbackQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError('Validation failed', 400, 'VALIDATION_ERROR');
    }
    const data = await feedbackService.listUninstallFeedback(
      parsed.data.page,
      parsed.data.limit,
      parsed.data.reason
    );
    res.json(ok(data));
  })
);
