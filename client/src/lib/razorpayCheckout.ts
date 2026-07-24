import type { PaidPlan } from '@cosmo/shared';
import {
  cancelSubscription,
  createSubscription,
  downloadInvoice,
  fetchMe,
  previewInvoice,
  verifySubscription,
} from './api';
import { useAuthStore } from '../store/authStore';

type RazorpaySuccessResponse = {
  razorpay_payment_id: string;
  razorpay_subscription_id: string;
  razorpay_signature: string;
};

type RazorpayOptions = {
  key: string;
  name: string;
  description: string;
  subscription_id: string;
  prefill?: { name?: string; email?: string };
  theme?: { color?: string };
  handler: (response: RazorpaySuccessResponse) => void;
  modal?: { ondismiss?: () => void };
};

type RazorpayInstance = {
  open: () => void;
  on: (event: string, handler: (response: unknown) => void) => void;
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

let scriptPromise: Promise<void> | null = null;

function loadRazorpayScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-razorpay="checkout"]'
    );
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () =>
        reject(new Error('Failed to load Razorpay'))
      );
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.dataset.razorpay = 'checkout';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Razorpay'));
    document.body.appendChild(script);
  });

  return scriptPromise;
}

export type CheckoutResult = {
  paymentId: string;
  plan: PaidPlan;
  planExpiresAt: string;
  invoiceUrl: string;
  invoiceNumber: string;
};

export async function startPlanCheckout(
  plan: PaidPlan
): Promise<CheckoutResult> {
  await loadRazorpayScript();
  if (!window.Razorpay) {
    throw new Error('Razorpay Checkout failed to load');
  }

  const subRes = await createSubscription(plan);
  if (!subRes.success) {
    throw new Error(subRes.message || 'Could not create subscription');
  }

  const sub = subRes.data;
  const user = useAuthStore.getState().user;
  const key =
    sub.keyId ||
    (import.meta.env.VITE_RAZORPAY_KEY_ID as string | undefined) ||
    '';

  if (!key) {
    throw new Error('Razorpay key is not configured');
  }

  return new Promise<CheckoutResult>((resolve, reject) => {
    let settled = false;

    const rzp = new window.Razorpay!({
      key,
      name: 'Cosmo',
      description:
        plan === 'pro'
          ? 'Premium — monthly subscription'
          : 'UltraMag — monthly subscription',
      subscription_id: sub.subscriptionId,
      prefill: {
        name: user?.name,
        email: user?.email,
      },
      theme: { color: '#15362b' },
      handler: (response) => {
        void (async () => {
          try {
            const verifyRes = await verifySubscription({
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_subscription_id: response.razorpay_subscription_id,
              razorpay_signature: response.razorpay_signature,
              plan,
            });
            if (!verifyRes.success) {
              throw new Error(
                verifyRes.message || 'Subscription verification failed'
              );
            }

            const me = await fetchMe();
            if (me.success) {
              const tokens = useAuthStore.getState();
              if (tokens.accessToken && tokens.refreshToken) {
                useAuthStore.getState().setSession({
                  accessToken: tokens.accessToken,
                  refreshToken: tokens.refreshToken,
                  user: me.data,
                });
              }
            }

            settled = true;
            resolve({
              paymentId: verifyRes.data.paymentId,
              plan: verifyRes.data.plan,
              planExpiresAt: verifyRes.data.planExpiresAt,
              invoiceUrl: verifyRes.data.invoiceUrl,
              invoiceNumber: verifyRes.data.invoiceNumber,
            });
          } catch (error) {
            settled = true;
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        })();
      },
      modal: {
        ondismiss: () => {
          if (!settled) {
            reject(new Error('Payment cancelled'));
          }
        },
      },
    });

    rzp.on('payment.failed', () => {
      if (!settled) {
        settled = true;
        reject(new Error('Payment failed'));
      }
    });

    rzp.open();
  });
}

export async function cancelPlanSubscription(immediate = false) {
  const res = await cancelSubscription(immediate);
  if (!res.success) {
    throw new Error(res.message || 'Could not cancel subscription');
  }
  return res.data;
}

export async function downloadPaymentInvoice(paymentId: string): Promise<void> {
  await downloadInvoice(paymentId);
}

export async function previewPaymentInvoice(paymentId: string): Promise<string> {
  return previewInvoice(paymentId);
}
