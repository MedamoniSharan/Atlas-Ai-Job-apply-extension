import { Router } from 'express';
import {
  cancelSubscriptionSchema,
  createBillingOrderSchema,
  createSubscriptionSchema,
  ok,
  validateCouponSchema,
  verifyBillingPaymentSchema,
  verifySubscriptionSchema,
} from '@cosmo/shared';
import { asyncHandler } from '../../middleware/errorHandler';
import { requireAuth, AuthedRequest } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import * as billingService from './billing.service';
import * as offerService from './offer.service';
import * as bannerService from './banner.service';
import { listPublicPlans } from './planConfig.service';

export const billingRouter = Router();

billingRouter.get(
  '/plans',
  asyncHandler(async (_req, res) => {
    const data = await listPublicPlans();
    res.json(ok(data));
  })
);

billingRouter.get(
  '/offers',
  asyncHandler(async (_req, res) => {
    const data = await offerService.listActiveOffers();
    res.json(ok(data));
  })
);

billingRouter.get(
  '/banners',
  asyncHandler(async (_req, res) => {
    const data = await bannerService.listActiveBanners();
    res.json(ok(data));
  })
);

billingRouter.post(
  '/validate-coupon',
  requireAuth,
  validateBody(validateCouponSchema),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = await billingService.validateCouponForUser(
      req.user!.sub,
      req.body
    );
    res.json(ok(data));
  })
);

billingRouter.post(
  '/create-order',
  requireAuth,
  validateBody(createBillingOrderSchema),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = await billingService.createOrder(req.user!.sub, req.body);
    res.status(201).json(ok(data, 'Order created'));
  })
);

billingRouter.post(
  '/verify',
  requireAuth,
  validateBody(verifyBillingPaymentSchema),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = await billingService.verifyPayment(req.user!.sub, req.body);
    res.json(ok(data, 'Payment verified'));
  })
);

billingRouter.post(
  '/subscribe',
  requireAuth,
  validateBody(createSubscriptionSchema),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = await billingService.createSubscription(
      req.user!.sub,
      req.body
    );
    res.status(201).json(ok(data, 'Subscription created'));
  })
);

billingRouter.post(
  '/verify-subscription',
  requireAuth,
  validateBody(verifySubscriptionSchema),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = await billingService.verifySubscription(
      req.user!.sub,
      req.body
    );
    res.json(ok(data, 'Subscription verified'));
  })
);

billingRouter.post(
  '/cancel',
  requireAuth,
  validateBody(cancelSubscriptionSchema),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = await billingService.cancelSubscription(
      req.user!.sub,
      req.body
    );
    res.json(ok(data, 'Subscription cancellation scheduled'));
  })
);

billingRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = await billingService.getBillingMe(req.user!.sub);
    res.json(ok(data));
  })
);

billingRouter.get(
  '/invoices/:paymentId',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const paymentId = String(req.params.paymentId);
    const inline =
      String(req.query.inline ?? '') === '1' ||
      String(req.query.disposition ?? '') === 'inline';
    const { absolutePath, filename } = await billingService.getInvoiceStream(
      req.user!.sub,
      paymentId
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `${inline ? 'inline' : 'attachment'}; filename="${filename}"`
    );
    res.sendFile(absolutePath);
  })
);
