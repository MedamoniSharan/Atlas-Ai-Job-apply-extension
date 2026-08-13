import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Eye, FileText, X } from 'lucide-react';
import {
  DEFAULT_PLAN_FEATURES,
  PLAN_DISPLAY_NAMES,
  PLAN_PRICES_PAISE,
  type BillingFrequency,
  type PaidPlan,
  type PlanTier,
} from '@cosmo/shared';
import { fetchBillingMe, fetchPublicPlans, validateCoupon } from '../lib/api';
import {
  downloadPaymentInvoice,
  previewPaymentInvoice,
  startPlanCheckout,
  cancelPlanSubscription,
} from '../lib/razorpayCheckout';
import { useAuthStore } from '../store/authStore';
import { CosmosLoader } from '../components/CosmosLogo';
import { ProfilePricingPlans } from '../components/ProfilePricingPlans';
import confetti from 'canvas-confetti';

function formatInr(amountPaise: number): string {
  return `₹${(amountPaise / 100).toFixed(0)}`;
}

export function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [busyPlan, setBusyPlan] = useState<PaidPlan | null>(null);
  const [busyCancel, setBusyCancel] = useState(false);
  const [busyInvoiceId, setBusyInvoiceId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<'preview' | 'download' | null>(
    null
  );
  const [status, setStatus] = useState<string | null>(null);
  const [lastPaymentId, setLastPaymentId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState('Invoice preview');
  const [couponCode, setCouponCode] = useState('');
  const [couponHint, setCouponHint] = useState<string | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [couponDiscounts, setCouponDiscounts] = useState<
    Partial<
      Record<
        PaidPlan,
        {
          originalAmountPaise: number;
          finalAmountPaise: number;
          label: string;
        }
      >
    >
  >({});

  const { data, isLoading, isError } = useQuery({
    queryKey: ['billing', 'me'],
    queryFn: async () => {
      const res = await fetchBillingMe();
      if (!res.success) throw new Error(res.message);
      return res.data;
    },
    staleTime: 30_000,
  });

  const { data: catalog } = useQuery({
    queryKey: ['public', 'plans'],
    queryFn: async () => {
      const res = await fetchPublicPlans();
      if (!res.success) throw new Error(res.message);
      return res.data ?? [];
    },
    staleTime: 60_000,
  });

  const planCards = useMemo(() => {
    const byTier = new Map(
      (catalog ?? []).map((p) => [p.tier, p] as const)
    );
    const tiers: PlanTier[] = ['free', 'pro', 'max'];
    return tiers.map((tier) => {
      const p = byTier.get(tier);
      return {
        tier,
        name: p?.name || PLAN_DISPLAY_NAMES[tier],
        description: p?.description,
        amountPaise:
          p?.amountPaise ??
          (tier === 'free' ? 0 : PLAN_PRICES_PAISE[tier as PaidPlan]),
        features:
          p?.features?.length ? p.features : DEFAULT_PLAN_FEATURES[tier],
      };
    });
  }, [catalog]);

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.hash !== '#plans') return;
    const el = document.getElementById('plans');
    if (!el) return;
    const timer = window.setTimeout(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [isLoading]);

  async function applyCoupon(frequency: BillingFrequency = 'monthly') {
    const code = couponCode.trim();
    if (!code) {
      setCouponError('Enter a coupon code');
      setCouponHint(null);
      setCouponDiscounts({});
      return;
    }

    setCouponBusy(true);
    setCouponError(null);
    setCouponHint(null);

    const next: typeof couponDiscounts = {};
    const labels: string[] = [];
    let lastError: string | null = null;

    for (const paid of ['pro', 'max'] as PaidPlan[]) {
      const preview = await validateCoupon(code, paid, frequency);
      if (preview.success) {
        next[paid] = {
          originalAmountPaise: preview.data.originalAmountPaise,
          finalAmountPaise: preview.data.finalAmountPaise,
          label: preview.data.label,
        };
        labels.push(`${paid === 'pro' ? 'Pro' : 'Max'}: ${preview.data.label}`);
      } else {
        lastError = preview.message || 'Invalid coupon';
      }
    }

    if (Object.keys(next).length === 0) {
      setCouponDiscounts({});
      setCouponHint(null);
      setCouponError(lastError || 'Coupon does not apply to any plan');
    } else {
      setCouponDiscounts(next);
      setCouponHint(labels.join(' · '));
      setCouponError(null);
      confetti({
        particleCount: 55,
        spread: 55,
        origin: { y: 0.4 },
        colors: ['#15362b', '#34d399', '#f59e0b', '#ffffff'],
        disableForReducedMotion: true,
      });
    }
    setCouponBusy(false);
  }

  async function upgrade(plan: PaidPlan, frequency: BillingFrequency = 'monthly') {
    setBusyPlan(plan);
    setStatus(null);
    setLastPaymentId(null);
    try {
      const code = couponCode.trim();
      if (code && !couponDiscounts[plan]) {
        const preview = await validateCoupon(code, plan, frequency);
        if (preview.success) {
          setCouponDiscounts((prev) => ({
            ...prev,
            [plan]: {
              originalAmountPaise: preview.data.originalAmountPaise,
              finalAmountPaise: preview.data.finalAmountPaise,
              label: preview.data.label,
            },
          }));
          setCouponHint(preview.data.label);
          setCouponError(null);
        } else {
          setCouponError(preview.message || 'Invalid coupon');
          setBusyPlan(null);
          return;
        }
      }
      const result = await startPlanCheckout(plan, code || undefined, frequency);
      setLastPaymentId(result.paymentId);
      setStatus(
        `${plan === 'pro' ? 'Premium' : 'UltraMag'} subscription is active until ${new Date(result.planExpiresAt).toLocaleDateString('en-IN')}. Invoice ${result.invoiceNumber} is ready.`
      );
      await queryClient.invalidateQueries({ queryKey: ['billing', 'me'] });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Checkout failed';
      if (message !== 'Payment cancelled') setStatus(message);
    } finally {
      setBusyPlan(null);
    }
  }

  async function onCancelSubscription() {
    setBusyCancel(true);
    setStatus(null);
    try {
      const result = await cancelPlanSubscription(false);
      setStatus(
        result.cancelAtPeriodEnd
          ? `Cancellation scheduled. Access continues until ${
              result.planExpiresAt
                ? new Date(result.planExpiresAt).toLocaleDateString('en-IN')
                : 'period end'
            }.`
          : 'Subscription cancelled.'
      );
      await queryClient.invalidateQueries({ queryKey: ['billing', 'me'] });
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : 'Could not cancel subscription'
      );
    } finally {
      setBusyCancel(false);
    }
  }

  async function onPreview(paymentId: string, title?: string) {
    setBusyInvoiceId(paymentId);
    setBusyAction('preview');
    try {
      const url = await previewPaymentInvoice(paymentId);
      setPreviewUrl((prev) => {
        if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev);
        return url;
      });
      setPreviewTitle(title ?? 'Invoice preview');
    } catch {
      setStatus('Could not preview invoice. Try again.');
    } finally {
      setBusyInvoiceId(null);
      setBusyAction(null);
    }
  }

  async function onDownload(paymentId: string) {
    setBusyInvoiceId(paymentId);
    setBusyAction('download');
    try {
      await downloadPaymentInvoice(paymentId);
    } catch {
      setStatus('Could not download invoice. Try again.');
    } finally {
      setBusyInvoiceId(null);
      setBusyAction(null);
    }
  }

  function closePreview() {
    setPreviewUrl((prev) => {
      if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev);
      return null;
    });
  }

  if (isLoading) {
    return (
      <div className="dash">
        <CosmosLoader label="Loading profile…" className="cosmos-loader--inline" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="dash">
        <div className="panel">
          <p className="muted">Couldn’t load plan details. Try again shortly.</p>
        </div>
      </div>
    );
  }

  const plan = data.plan;
  const planLabel = PLAN_DISPLAY_NAMES[plan];
  const payments = data.payments ?? [];

  return (
    <div className="dash">
      <div className="panel profile-card">
        <div className="profile-card__identity">
          <div className="profile-card__avatar" aria-hidden>
            {(user?.name ?? 'U')
              .trim()
              .split(/\s+/)
              .slice(0, 2)
              .map((p) => p[0]?.toUpperCase() ?? '')
              .join('') || 'U'}
          </div>
          <div>
            <h2 className="profile-card__name">{user?.name || 'Account'}</h2>
            <p className="muted">{user?.email}</p>
            <span className={`profile-card__plan profile-card__plan--${plan}`}>
              {planLabel}
            </span>
          </div>
        </div>

        <p className="muted profile-card__copy">
          Job preferences live in Settings. Plan upgrades and invoices live here.
        </p>
        <Link className="dash-btn dash-btn--ghost" to="/settings">
          Open Settings
        </Link>
      </div>

      <div className="panel profile-plan" id="plans">
        <div className="profile-plan__head">
          <h2>Your plan</h2>
          <p className="muted">
            You’re on <strong>{planLabel}</strong>
            {data.planExpiresAt && plan !== 'free'
              ? ` · current period ends ${new Date(data.planExpiresAt).toLocaleDateString('en-IN')}`
              : null}
            {data.subscription?.cancelAtPeriodEnd
              ? ' · cancels at period end'
              : null}
            . Usage: {data.appliesDayUsed ?? 0}/{data.appliesDayLimit ?? 0} today ·{' '}
            {data.appliesUsed} / {data.appliesLimit} this month.
          </p>
          {data.subscription &&
          ['active', 'authenticated', 'pending', 'halted'].includes(
            data.subscription.status
          ) &&
          !data.subscription.cancelAtPeriodEnd ? (
            <button
              type="button"
              className="dash-btn dash-btn--ghost"
              disabled={busyCancel}
              onClick={() => void onCancelSubscription()}
            >
              {busyCancel ? (
                <CosmosLoader label="" size={18} className="cosmos-loader--inline" />
              ) : (
                'Cancel auto-renew'
              )}
            </button>
          ) : null}
        </div>

        {status ? (
          <div className="profile-plan__status-row" role="status">
            <p className="profile-plan__status">{status}</p>
            {lastPaymentId ? (
              <div className="profile-invoices__actions">
                <button
                  type="button"
                  className="dash-btn dash-btn--ghost"
                  disabled={busyInvoiceId === lastPaymentId}
                  onClick={() => void onPreview(lastPaymentId)}
                >
                  {busyInvoiceId === lastPaymentId && busyAction === 'preview' ? (
                    <CosmosLoader label="" size={18} className="cosmos-loader--inline" />
                  ) : (
                    <>
                      <Eye size={14} strokeWidth={2.2} aria-hidden />
                      Preview
                    </>
                  )}
                </button>
                <button
                  type="button"
                  className="dash-btn dash-btn--ghost"
                  disabled={busyInvoiceId === lastPaymentId}
                  onClick={() => void onDownload(lastPaymentId)}
                >
                  {busyInvoiceId === lastPaymentId &&
                  busyAction === 'download' ? (
                    <CosmosLoader label="" size={18} className="cosmos-loader--inline" />
                  ) : (
                    <>
                      <Download size={14} strokeWidth={2.2} aria-hidden />
                      Download
                    </>
                  )}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        <ProfilePricingPlans
          currentPlan={plan}
          planCards={planCards}
          couponCode={couponCode}
          couponHint={couponHint}
          couponError={couponError}
          couponBusy={couponBusy}
          couponDiscounts={couponDiscounts}
          busyPlan={busyPlan}
          onCouponChange={(code) => {
            setCouponCode(code);
            setCouponHint(null);
            setCouponError(null);
            setCouponDiscounts({});
          }}
          onApplyCoupon={(frequency) => void applyCoupon(frequency)}
          onUpgrade={(paid, frequency) => void upgrade(paid, frequency)}
        />
      </div>

      <div className="panel profile-invoices">
        <div className="profile-plan__head">
          <h2>Invoices</h2>
          <p className="muted">
            Preview or download watermarked PDFs for every successful payment.
          </p>
        </div>

        {payments.length === 0 ? (
          <p className="dash-empty">
            No invoices yet. Upgrade a plan to generate one.
          </p>
        ) : (
          <ul className="profile-invoices__list">
            {payments.map((payment) => {
              const title =
                payment.invoiceNumber ?? `Payment ${payment.id.slice(-6)}`;
              const busy = busyInvoiceId === payment.id;
              return (
                <li key={payment.id} className="profile-invoices__row">
                  <div className="profile-invoices__meta">
                    <span className="profile-invoices__icon" aria-hidden>
                      <FileText size={16} strokeWidth={1.9} />
                    </span>
                    <div>
                      <strong>{title}</strong>
                      <p>
                        {PLAN_DISPLAY_NAMES[payment.plan]} ·{' '}
                        {formatInr(payment.amountPaise)}
                        {payment.paidAt
                          ? ` · ${new Date(payment.paidAt).toLocaleDateString('en-IN')}`
                          : null}
                      </p>
                    </div>
                  </div>
                  <div className="profile-invoices__actions">
                    <button
                      type="button"
                      className="dash-btn dash-btn--ghost"
                      disabled={busy}
                      onClick={() => void onPreview(payment.id, title)}
                    >
                      {busy && busyAction === 'preview' ? (
                        <CosmosLoader
                          label=""
                          size={18}
                          className="cosmos-loader--inline"
                        />
                      ) : (
                        <>
                          <Eye size={14} strokeWidth={2.2} aria-hidden />
                          Preview
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      className="dash-btn dash-btn--ghost"
                      disabled={busy}
                      onClick={() => void onDownload(payment.id)}
                    >
                      {busy && busyAction === 'download' ? (
                        <CosmosLoader
                          label=""
                          size={18}
                          className="cosmos-loader--inline"
                        />
                      ) : (
                        <>
                          <Download size={14} strokeWidth={2.2} aria-hidden />
                          Download
                        </>
                      )}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {previewUrl ? (
        <div
          className="invoice-preview"
          role="dialog"
          aria-modal="true"
          aria-label={previewTitle}
        >
          <div className="invoice-preview__backdrop" onClick={closePreview} />
          <div className="invoice-preview__panel">
            <header className="invoice-preview__head">
              <div>
                <h2>{previewTitle}</h2>
                <p className="muted">PDF preview</p>
              </div>
              <button
                type="button"
                className="dash-btn dash-btn--ghost"
                onClick={closePreview}
                aria-label="Close preview"
              >
                <X size={16} strokeWidth={2} aria-hidden />
                Close
              </button>
            </header>
            <iframe
              className="invoice-preview__frame"
              title={previewTitle}
              src={previewUrl}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
