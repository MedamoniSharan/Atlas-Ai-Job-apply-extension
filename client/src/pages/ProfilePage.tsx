import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Download, Eye, FileText, Sparkles, X } from 'lucide-react';
import type { PaidPlan, PlanTier } from '@atlas/shared';
import { fetchBillingMe } from '../lib/api';
import {
  downloadPaymentInvoice,
  previewPaymentInvoice,
  startPlanCheckout,
} from '../lib/razorpayCheckout';
import { useAuthStore } from '../store/authStore';
import { CosmosLoader } from '../components/CosmosLogo';

const PLAN_LABEL: Record<PlanTier, string> = {
  free: 'Basic',
  pro: 'Premium',
  max: 'UltraMag',
};

const PLAN_FEATURES: Record<PlanTier, string[]> = {
  free: ['50 automated applies / month', '500 multi-board scans / month'],
  pro: [
    '300 automated applies / month',
    '1500 multi-board scans / month',
    'Human-paced co-pilot',
  ],
  max: [
    '1000 automated applies / month',
    '5000 multi-board scans / month',
    'Human-paced co-pilot',
    'Highest monthly volume',
  ],
};

function formatInr(amountPaise: number): string {
  return `₹${(amountPaise / 100).toFixed(0)}`;
}

export function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [busyPlan, setBusyPlan] = useState<PaidPlan | null>(null);
  const [busyInvoiceId, setBusyInvoiceId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<'preview' | 'download' | null>(
    null
  );
  const [status, setStatus] = useState<string | null>(null);
  const [lastPaymentId, setLastPaymentId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState('Invoice preview');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['billing', 'me'],
    queryFn: async () => {
      const res = await fetchBillingMe();
      if (!res.success) throw new Error(res.message);
      return res.data;
    },
    staleTime: 30_000,
  });

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function upgrade(plan: PaidPlan) {
    setBusyPlan(plan);
    setStatus(null);
    setLastPaymentId(null);
    try {
      const result = await startPlanCheckout(plan);
      setLastPaymentId(result.paymentId);
      setStatus(
        `${plan === 'pro' ? 'Premium' : 'UltraMag'} is active until ${new Date(result.planExpiresAt).toLocaleDateString('en-IN')}. Invoice ${result.invoiceNumber} is ready.`
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

  async function onPreview(paymentId: string, title?: string) {
    setBusyInvoiceId(paymentId);
    setBusyAction('preview');
    try {
      const url = await previewPaymentInvoice(paymentId);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
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
      if (prev) URL.revokeObjectURL(prev);
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
  const planLabel = PLAN_LABEL[plan];
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

      <div className="panel profile-plan">
        <div className="profile-plan__head">
          <h2>Your plan</h2>
          <p className="muted">
            You’re on <strong>{planLabel}</strong>
            {data.planExpiresAt && plan !== 'free'
              ? ` · renews/expires ${new Date(data.planExpiresAt).toLocaleDateString('en-IN')}`
              : null}
            . Usage: {data.appliesHourUsed ?? 0}/{data.appliesHourLimit ?? 0} this hour ·{' '}
            {data.appliesDayUsed ?? 0}/{data.appliesDayLimit ?? 0} today ·{' '}
            {data.appliesUsed} / {data.appliesLimit} this month.
          </p>
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

        <div className="profile-plan__grid">
          <article
            className={`profile-plan__option${plan === 'free' ? ' is-current' : ''}`}
          >
            <div className="profile-plan__option-top">
              <h3>Basic</h3>
              <strong>₹0</strong>
            </div>
            <ul>
              {PLAN_FEATURES.free.map((f) => (
                <li key={f}>
                  <Check size={14} strokeWidth={2.2} aria-hidden />
                  {f}
                </li>
              ))}
            </ul>
            {plan === 'free' ? (
              <span className="profile-plan__current">Current plan</span>
            ) : null}
          </article>

          <article
            className={`profile-plan__option${plan === 'pro' ? ' is-current' : ''}`}
          >
            <div className="profile-plan__option-top">
              <h3>
                Premium
                <Sparkles size={14} strokeWidth={2} aria-hidden />
              </h3>
              <strong>
                ₹99<span>/mo</span>
              </strong>
            </div>
            <ul>
              {PLAN_FEATURES.pro.map((f) => (
                <li key={f}>
                  <Check size={14} strokeWidth={2.2} aria-hidden />
                  {f}
                </li>
              ))}
            </ul>
            {plan === 'pro' ? (
              <span className="profile-plan__current">Current plan</span>
            ) : plan === 'max' ? null : (
              <button
                type="button"
                className="dash-btn dash-btn--primary"
                disabled={busyPlan !== null}
                onClick={() => void upgrade('pro')}
              >
                {busyPlan === 'pro' ? (
                  <CosmosLoader label="" size={20} className="cosmos-loader--inline" />
                ) : (
                  'Upgrade to Premium'
                )}
              </button>
            )}
          </article>

          <article
            className={`profile-plan__option${plan === 'max' ? ' is-current' : ''}`}
          >
            <div className="profile-plan__option-top">
              <h3>UltraMag</h3>
              <strong>
                ₹299<span>/mo</span>
              </strong>
            </div>
            <ul>
              {PLAN_FEATURES.max.map((f) => (
                <li key={f}>
                  <Check size={14} strokeWidth={2.2} aria-hidden />
                  {f}
                </li>
              ))}
            </ul>
            {plan === 'max' ? (
              <span className="profile-plan__current">Current plan</span>
            ) : (
              <button
                type="button"
                className="dash-btn dash-btn--primary"
                disabled={busyPlan !== null}
                onClick={() => void upgrade('max')}
              >
                {busyPlan === 'max' ? (
                  <CosmosLoader label="" size={20} className="cosmos-loader--inline" />
                ) : (
                  'Upgrade to UltraMag'
                )}
              </button>
            )}
          </article>
        </div>
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
                        {PLAN_LABEL[payment.plan]} ·{' '}
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
