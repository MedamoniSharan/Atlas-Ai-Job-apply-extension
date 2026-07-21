import { Router } from 'express';
import {
  createBillingOrderSchema,
  ok,
  verifyBillingPaymentSchema,
} from '@atlas/shared';
import { asyncHandler } from '../../middleware/errorHandler';
import { requireAuth, AuthedRequest } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import * as billingService from './billing.service';

export const billingRouter = Router();

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
