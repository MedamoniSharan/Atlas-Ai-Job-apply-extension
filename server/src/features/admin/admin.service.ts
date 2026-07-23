import rateLimit from 'express-rate-limit';
import {
  PLAN_DISPLAY_NAMES,
  PLAN_PRICES_PAISE,
  type AdminExtendSubscriptionInput,
  type AdminMetricsQuery,
  type AdminPatchUserInput,
  type AdminPaymentsQuery,
  type AdminSetPlanInput,
  type AdminSubscriptionsQuery,
  type AdminUpdatePlanInput,
  type AdminUsersQuery,
  type PaidPlan,
  type PlanTier,
} from '@atlas/shared';
import { AppError } from '../../middleware/errorHandler';
import { UserModel } from '../users/user.model';
import { PaymentModel } from '../billing/payment.model';
import {
  AdminAuditLogModel,
  PlanConfigModel,
  SubscriptionModel,
} from '../billing/subscription.model';
import {
  getPaidPlanAmount,
  invalidatePlanCache,
  listPlanConfigs,
  seedPlanConfigs,
} from '../billing/planConfig.service';
import { env } from '../../config/env';
import Razorpay from 'razorpay';

export const adminRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

async function writeAudit(input: {
  adminId: string;
  action: string;
  targetType: string;
  targetId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ip?: string;
}) {
  await AdminAuditLogModel.create(input);
}

function getRazorpay() {
  if (!env.razorpayKeyId || !env.razorpayKeySecret) {
    throw new AppError(
      'Razorpay is not configured',
      503,
      'RAZORPAY_NOT_CONFIGURED'
    );
  }
  return new Razorpay({
    key_id: env.razorpayKeyId,
    key_secret: env.razorpayKeySecret,
  });
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return startOfDay(d);
}

export async function getMetrics(query: AdminMetricsQuery) {
  const days = query.days ?? 30;
  const since = daysAgo(days);
  const now = new Date();
  const day7 = daysAgo(7);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const yearStart = new Date(now.getFullYear(), 0, 1);

  const [
    totalUsers,
    newUsers7,
    newUsers30,
    planMix,
    activeSubs,
    revenuePaid,
    revenueMtd,
    revenueYtd,
    failedPayments,
    cancelledSubs,
    recentPayments,
    expiringSoon,
    haltedSubs,
  ] = await Promise.all([
    UserModel.countDocuments(),
    UserModel.countDocuments({ createdAt: { $gte: day7 } }),
    UserModel.countDocuments({ createdAt: { $gte: daysAgo(30) } }),
    UserModel.aggregate<{ _id: PlanTier; count: number }>([
      {
        $project: {
          effective: {
            $cond: [
              {
                $and: [
                  { $in: ['$plan', ['pro', 'max']] },
                  { $gt: ['$planExpiresAt', now] },
                ],
              },
              '$plan',
              'free',
            ],
          },
        },
      },
      { $group: { _id: '$effective', count: { $sum: 1 } } },
    ]),
    SubscriptionModel.find({
      status: { $in: ['active', 'authenticated', 'pending'] },
    }).lean(),
    PaymentModel.aggregate<{ _id: string; total: number; count: number }>([
      {
        $match: {
          status: 'paid',
          createdAt: { $gte: since },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
          },
          total: { $sum: '$amountPaise' },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    PaymentModel.aggregate<{ total: number }>([
      {
        $match: { status: 'paid', createdAt: { $gte: monthStart } },
      },
      { $group: { _id: null, total: { $sum: '$amountPaise' } } },
    ]),
    PaymentModel.aggregate<{ total: number }>([
      {
        $match: { status: 'paid', createdAt: { $gte: yearStart } },
      },
      { $group: { _id: null, total: { $sum: '$amountPaise' } } },
    ]),
    PaymentModel.countDocuments({
      status: 'failed',
      createdAt: { $gte: since },
    }),
    SubscriptionModel.countDocuments({
      status: 'cancelled',
      cancelledAt: { $gte: since },
    }),
    PaymentModel.find({ status: 'paid' })
      .sort({ createdAt: -1 })
      .limit(8)
      .populate('userId', 'name email')
      .lean(),
    SubscriptionModel.find({
      status: { $in: ['active', 'authenticated'] },
      currentPeriodEnd: {
        $gte: now,
        $lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      },
    })
      .sort({ currentPeriodEnd: 1 })
      .limit(8)
      .populate('userId', 'name email')
      .lean(),
    SubscriptionModel.find({ status: 'halted' })
      .sort({ updatedAt: -1 })
      .limit(8)
      .populate('userId', 'name email')
      .lean(),
  ]);

  const signupsSeries = await UserModel.aggregate<{
    _id: string;
    count: number;
  }>([
    { $match: { createdAt: { $gte: since } } },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const paymentOutcome = await PaymentModel.aggregate<{
    _id: string;
    count: number;
  }>([
    { $match: { createdAt: { $gte: since } } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  const plans = await listPlanConfigs();
  const priceByTier = Object.fromEntries(
    plans.map((p) => [p.tier, p.amountPaise])
  ) as Record<PlanTier, number>;

  let mrrPaise = 0;
  for (const s of activeSubs) {
    mrrPaise +=
      priceByTier[s.tier] ??
      PLAN_PRICES_PAISE[s.tier as PaidPlan] ??
      0;
  }

  const mixMap: Record<string, number> = { free: 0, pro: 0, max: 0 };
  for (const row of planMix) {
    mixMap[row._id] = row.count;
  }

  const activePaid = (mixMap.pro ?? 0) + (mixMap.max ?? 0);

  return {
    kpis: {
      totalUsers,
      newUsers7,
      newUsers30,
      activePaid,
      mrrPaise,
      revenueMtdPaise: revenueMtd[0]?.total ?? 0,
      revenueYtdPaise: revenueYtd[0]?.total ?? 0,
      failedPayments,
      churnCancels: cancelledSubs,
    },
    series: {
      revenueDaily: revenuePaid.map((r) => ({
        date: r._id,
        amountPaise: r.total,
        count: r.count,
      })),
      signupsDaily: signupsSeries.map((r) => ({
        date: r._id,
        count: r.count,
      })),
      planMix: [
        { tier: 'free', count: mixMap.free ?? 0 },
        { tier: 'pro', count: mixMap.pro ?? 0 },
        { tier: 'max', count: mixMap.max ?? 0 },
      ],
      paymentOutcomes: paymentOutcome.map((r) => ({
        status: r._id,
        count: r.count,
      })),
      subsByTier: [
        {
          tier: 'pro',
          count: activeSubs.filter((s) => s.tier === 'pro').length,
        },
        {
          tier: 'max',
          count: activeSubs.filter((s) => s.tier === 'max').length,
        },
      ],
    },
    lists: {
      recentPayments: recentPayments.map((p) => {
        const u = p.userId as unknown as {
          name?: string;
          email?: string;
        } | null;
        return {
          id: p._id.toString(),
          plan: p.plan,
          amountPaise: p.amountPaise,
          paidAt: p.createdAt?.toISOString?.(),
          userName: u?.name,
          userEmail: u?.email,
        };
      }),
      expiringSoon: expiringSoon.map((s) => {
        const u = s.userId as unknown as {
          name?: string;
          email?: string;
        } | null;
        return {
          id: s._id.toString(),
          tier: s.tier,
          currentPeriodEnd: s.currentPeriodEnd?.toISOString?.() ?? null,
          userName: u?.name,
          userEmail: u?.email,
        };
      }),
      haltedSubs: haltedSubs.map((s) => {
        const u = s.userId as unknown as {
          name?: string;
          email?: string;
        } | null;
        return {
          id: s._id.toString(),
          tier: s.tier,
          updatedAt: s.updatedAt?.toISOString?.(),
          userName: u?.name,
          userEmail: u?.email,
        };
      }),
    },
  };
}

export async function listUsers(query: AdminUsersQuery) {
  const filter: Record<string, unknown> = {};
  if (query.q?.trim()) {
    const q = query.q.trim();
    filter.$or = [
      { email: { $regex: q, $options: 'i' } },
      { name: { $regex: q, $options: 'i' } },
    ];
  }
  if (query.plan) filter.plan = query.plan;
  if (query.role) filter.role = query.role;
  if (query.status) filter.status = query.status;

  const page = query.page ?? 1;
  const limit = query.limit ?? 20;
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    UserModel.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-passwordHash -refreshTokenHash')
      .lean(),
    UserModel.countDocuments(filter),
  ]);

  return {
    items: items.map((u) => ({
      id: u._id.toString(),
      email: u.email,
      name: u.name,
      role: u.role ?? 'user',
      status: u.status ?? 'active',
      plan: u.plan,
      planExpiresAt: u.planExpiresAt?.toISOString?.() ?? null,
      extensionConnectedAt: u.extensionConnectedAt?.toISOString?.() ?? null,
      createdAt: u.createdAt?.toISOString?.(),
    })),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export async function getUser(userId: string) {
  const user = await UserModel.findById(userId)
    .select('-passwordHash -refreshTokenHash')
    .lean();
  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  const [subscription, payments] = await Promise.all([
    SubscriptionModel.findOne({ userId })
      .sort({ createdAt: -1 })
      .lean(),
    PaymentModel.find({ userId }).sort({ createdAt: -1 }).limit(20).lean(),
  ]);

  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    role: user.role ?? 'user',
    status: user.status ?? 'active',
    plan: user.plan,
    planExpiresAt: user.planExpiresAt?.toISOString?.() ?? null,
    extensionConnectedAt: user.extensionConnectedAt?.toISOString?.() ?? null,
    createdAt: user.createdAt?.toISOString?.(),
    preferences: user.preferences ?? null,
    preferencesCompletedAt:
      user.preferencesCompletedAt?.toISOString?.() ?? null,
    razorpayCustomerId: user.razorpayCustomerId ?? null,
    subscription: subscription
      ? {
          id: subscription._id.toString(),
          tier: subscription.tier,
          status: subscription.status,
          source: subscription.source,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          currentPeriodStart:
            subscription.currentPeriodStart?.toISOString?.() ?? null,
          currentPeriodEnd:
            subscription.currentPeriodEnd?.toISOString?.() ?? null,
          razorpaySubscriptionId: subscription.razorpaySubscriptionId,
        }
      : null,
    payments: payments.map((p) => ({
      id: p._id.toString(),
      plan: p.plan,
      amountPaise: p.amountPaise,
      status: p.status,
      type: p.type,
      invoiceNumber: p.invoiceNumber,
      createdAt: p.createdAt?.toISOString?.(),
    })),
  };
}

export async function patchUser(
  adminId: string,
  userId: string,
  input: AdminPatchUserInput,
  ip?: string
) {
  const user = await UserModel.findById(userId);
  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  const before = {
    name: user.name,
    role: user.role,
    status: user.status,
  };

  if (input.role === 'user' && user.role === 'admin') {
    const adminCount = await UserModel.countDocuments({ role: 'admin' });
    if (adminCount <= 1) {
      throw new AppError(
        'Cannot demote the last admin',
        400,
        'LAST_ADMIN'
      );
    }
    if (adminId === userId) {
      throw new AppError(
        'Cannot demote yourself',
        400,
        'SELF_DEMOTE'
      );
    }
  }

  if (input.name !== undefined) user.name = input.name;
  if (input.role !== undefined) user.role = input.role;
  if (input.status !== undefined) user.status = input.status;
  await user.save();

  await writeAudit({
    adminId,
    action: 'user.patch',
    targetType: 'user',
    targetId: userId,
    before,
    after: {
      name: user.name,
      role: user.role,
      status: user.status,
    },
    ip,
  });

  return getUser(userId);
}

export async function setUserPlan(
  adminId: string,
  userId: string,
  input: AdminSetPlanInput,
  ip?: string
) {
  const user = await UserModel.findById(userId);
  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  const before = {
    plan: user.plan,
    planExpiresAt: user.planExpiresAt?.toISOString?.() ?? null,
  };

  if (input.action === 'revoke') {
    await SubscriptionModel.updateMany(
      {
        userId,
        status: { $in: ['active', 'authenticated', 'pending', 'halted', 'created'] },
      },
      {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelAtPeriodEnd: false,
      }
    );
    user.plan = 'free';
    user.planExpiresAt = null;
    user.activeSubscriptionId = null;
    await user.save();
  } else {
    const plan = input.plan ?? (user.plan === 'free' ? 'pro' : (user.plan as PaidPlan));
    const days = input.days ?? 30;
    const now = new Date();
    const base =
      input.action === 'extend' &&
      user.planExpiresAt &&
      user.planExpiresAt > now
        ? user.planExpiresAt
        : now;
    const periodEnd = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);

    const sub = await SubscriptionModel.create({
      userId,
      tier: plan,
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: true,
      source: 'admin_grant',
    });

    user.plan = plan;
    user.planExpiresAt = periodEnd;
    user.activeSubscriptionId = sub._id;
    await user.save();

    const amountPaise = await getPaidPlanAmount(plan);
    await PaymentModel.create({
      userId,
      plan,
      amountPaise: 0,
      currency: 'INR',
      type: 'admin',
      status: 'paid',
    });
    void amountPaise;
  }

  await writeAudit({
    adminId,
    action: `user.plan.${input.action}`,
    targetType: 'user',
    targetId: userId,
    before,
    after: {
      plan: user.plan,
      planExpiresAt: user.planExpiresAt?.toISOString?.() ?? null,
    },
    ip,
  });

  return getUser(userId);
}

export async function listSubscriptions(query: AdminSubscriptionsQuery) {
  const filter: Record<string, unknown> = {};
  if (query.status) filter.status = query.status;
  if (query.tier) filter.tier = query.tier;

  const page = query.page ?? 1;
  const limit = query.limit ?? 20;
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    SubscriptionModel.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('userId', 'name email')
      .lean(),
    SubscriptionModel.countDocuments(filter),
  ]);

  return {
    items: items.map((s) => {
      const u = s.userId as unknown as {
        _id?: { toString(): string };
        name?: string;
        email?: string;
      } | null;
      return {
        id: s._id.toString(),
        userId: u?._id?.toString?.() ?? String(s.userId),
        userName: u?.name,
        userEmail: u?.email,
        tier: s.tier,
        status: s.status,
        source: s.source,
        cancelAtPeriodEnd: s.cancelAtPeriodEnd,
        currentPeriodStart: s.currentPeriodStart?.toISOString?.() ?? null,
        currentPeriodEnd: s.currentPeriodEnd?.toISOString?.() ?? null,
        razorpaySubscriptionId: s.razorpaySubscriptionId,
        createdAt: s.createdAt?.toISOString?.(),
      };
    }),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export async function cancelSubscriptionAdmin(
  adminId: string,
  subscriptionId: string,
  immediate: boolean,
  ip?: string
) {
  const sub = await SubscriptionModel.findById(subscriptionId);
  if (!sub) {
    throw new AppError('Subscription not found', 404, 'NOT_FOUND');
  }

  const before = { status: sub.status, cancelAtPeriodEnd: sub.cancelAtPeriodEnd };

  if (sub.source === 'razorpay' && sub.razorpaySubscriptionId) {
    try {
      const razorpay = getRazorpay();
      await razorpay.subscriptions.cancel(
        sub.razorpaySubscriptionId,
        !immediate
      );
    } catch {
      // still update local state
    }
  }

  if (immediate) {
    sub.status = 'cancelled';
    sub.cancelledAt = new Date();
    sub.cancelAtPeriodEnd = false;
    await sub.save();
    await UserModel.findByIdAndUpdate(sub.userId, {
      plan: 'free',
      planExpiresAt: null,
      activeSubscriptionId: null,
    });
  } else {
    sub.cancelAtPeriodEnd = true;
    await sub.save();
  }

  await writeAudit({
    adminId,
    action: immediate ? 'subscription.cancel.immediate' : 'subscription.cancel.period_end',
    targetType: 'subscription',
    targetId: subscriptionId,
    before,
    after: {
      status: sub.status,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    },
    ip,
  });

  return { id: sub._id.toString(), status: sub.status, cancelAtPeriodEnd: sub.cancelAtPeriodEnd };
}

export async function extendSubscriptionAdmin(
  adminId: string,
  subscriptionId: string,
  input: AdminExtendSubscriptionInput,
  ip?: string
) {
  const sub = await SubscriptionModel.findById(subscriptionId);
  if (!sub) {
    throw new AppError('Subscription not found', 404, 'NOT_FOUND');
  }

  const before = {
    currentPeriodEnd: sub.currentPeriodEnd?.toISOString?.() ?? null,
  };

  const base =
    sub.currentPeriodEnd && sub.currentPeriodEnd > new Date()
      ? sub.currentPeriodEnd
      : new Date();
  const periodEnd = new Date(
    base.getTime() + input.days * 24 * 60 * 60 * 1000
  );
  sub.currentPeriodEnd = periodEnd;
  if (sub.status === 'cancelled' || sub.status === 'expired') {
    sub.status = 'active';
  }
  await sub.save();

  await UserModel.findByIdAndUpdate(sub.userId, {
    plan: sub.tier,
    planExpiresAt: periodEnd,
    activeSubscriptionId: sub._id,
  });

  await writeAudit({
    adminId,
    action: 'subscription.extend',
    targetType: 'subscription',
    targetId: subscriptionId,
    before,
    after: { currentPeriodEnd: periodEnd.toISOString(), days: input.days },
    ip,
  });

  return {
    id: sub._id.toString(),
    currentPeriodEnd: periodEnd.toISOString(),
  };
}

export async function listPayments(query: AdminPaymentsQuery) {
  const filter: Record<string, unknown> = {};
  if (query.status) filter.status = query.status;
  if (query.plan) filter.plan = query.plan;
  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) {
      (filter.createdAt as Record<string, Date>).$gte = new Date(query.from);
    }
    if (query.to) {
      (filter.createdAt as Record<string, Date>).$lte = new Date(query.to);
    }
  }

  const page = query.page ?? 1;
  const limit = query.limit ?? 20;
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    PaymentModel.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('userId', 'name email')
      .lean(),
    PaymentModel.countDocuments(filter),
  ]);

  return {
    items: items.map((p) => {
      const u = p.userId as unknown as {
        _id?: { toString(): string };
        name?: string;
        email?: string;
      } | null;
      return {
        id: p._id.toString(),
        userId: u?._id?.toString?.() ?? String(p.userId),
        userName: u?.name,
        userEmail: u?.email,
        plan: p.plan,
        amountPaise: p.amountPaise,
        currency: p.currency,
        status: p.status,
        type: p.type,
        invoiceNumber: p.invoiceNumber,
        razorpayPaymentId: p.razorpayPaymentId,
        razorpayOrderId: p.razorpayOrderId,
        razorpaySubscriptionId: p.razorpaySubscriptionId,
        createdAt: p.createdAt?.toISOString?.(),
      };
    }),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export async function reconcilePayment(adminId: string, paymentId: string, ip?: string) {
  const payment = await PaymentModel.findById(paymentId);
  if (!payment) {
    throw new AppError('Payment not found', 404, 'NOT_FOUND');
  }

  const before = { status: payment.status };
  const razorpay = getRazorpay();

  try {
    if (payment.razorpayPaymentId) {
      const rp = await razorpay.payments.fetch(payment.razorpayPaymentId);
      if (rp.status === 'captured' || rp.status === 'authorized') {
        payment.status = 'paid';
      } else if (rp.status === 'failed') {
        payment.status = 'failed';
      }
    } else if (payment.razorpayOrderId) {
      const order = await razorpay.orders.fetch(payment.razorpayOrderId);
      if (order.status === 'paid') {
        payment.status = 'paid';
      }
    }
    await payment.save();
  } catch (err) {
    throw new AppError(
      err instanceof Error ? err.message : 'Reconcile failed',
      502,
      'RECONCILE_FAILED'
    );
  }

  await writeAudit({
    adminId,
    action: 'payment.reconcile',
    targetType: 'payment',
    targetId: paymentId,
    before,
    after: { status: payment.status },
    ip,
  });

  return {
    id: payment._id.toString(),
    status: payment.status,
  };
}

export async function listPlans() {
  await seedPlanConfigs();
  return listPlanConfigs();
}

export async function updatePlan(
  adminId: string,
  tier: PlanTier,
  input: AdminUpdatePlanInput,
  ip?: string
) {
  await seedPlanConfigs();
  const plan = await PlanConfigModel.findOne({ tier });
  if (!plan) {
    throw new AppError('Plan not found', 404, 'NOT_FOUND');
  }

  const before = {
    name: plan.name,
    amountPaise: plan.amountPaise,
    limits: { ...plan.limits },
    active: plan.active,
    razorpayPlanId: plan.razorpayPlanId,
  };

  if (input.name !== undefined) plan.name = input.name;
  if (input.description !== undefined) plan.description = input.description;
  if (input.active !== undefined) plan.active = input.active;
  if (input.limits) {
    plan.limits = input.limits;
  }

  const priceChanged =
    input.amountPaise !== undefined && input.amountPaise !== plan.amountPaise;

  if (input.amountPaise !== undefined) {
    plan.amountPaise = input.amountPaise;
  }

  if (priceChanged && tier !== 'free' && plan.amountPaise > 0) {
    const razorpay = getRazorpay();
    const created = await razorpay.plans.create({
      period: 'monthly',
      interval: 1,
      item: {
        name: `Cosmo ${plan.name}`,
        amount: plan.amountPaise,
        currency: 'INR',
        description: plan.description || `${plan.name} monthly`,
      },
      notes: { tier },
    });
    plan.razorpayPlanId = created.id;
  }

  await plan.save();
  invalidatePlanCache();

  await writeAudit({
    adminId,
    action: 'plan.update',
    targetType: 'plan',
    targetId: tier,
    before,
    after: {
      name: plan.name,
      amountPaise: plan.amountPaise,
      limits: { ...plan.limits },
      active: plan.active,
      razorpayPlanId: plan.razorpayPlanId,
    },
    ip,
  });

  return {
    tier: plan.tier,
    name: plan.name,
    description: plan.description,
    amountPaise: plan.amountPaise,
    limits: plan.limits,
    razorpayPlanId: plan.razorpayPlanId,
    active: plan.active,
    displayFallback: PLAN_DISPLAY_NAMES[tier],
  };
}

export async function listAudit(page = 1, limit = 40) {
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    AdminAuditLogModel.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('adminId', 'name email')
      .lean(),
    AdminAuditLogModel.countDocuments(),
  ]);

  return {
    items: items.map((a) => {
      const admin = a.adminId as unknown as {
        name?: string;
        email?: string;
      } | null;
      return {
        id: a._id.toString(),
        action: a.action,
        targetType: a.targetType,
        targetId: a.targetId,
        before: a.before,
        after: a.after,
        ip: a.ip,
        adminName: admin?.name,
        adminEmail: admin?.email,
        createdAt: a.createdAt?.toISOString?.(),
      };
    }),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}
