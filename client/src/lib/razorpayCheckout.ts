import type { PaidPlan } from '@atlas/shared';
import {
  createBillingOrder,
  downloadInvoice,
  fetchMe,
  previewInvoice,
  verifyBillingPayment,
} from './api';
import { useAuthStore } from '../store/authStore';

type RazorpaySuccessResponse = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

type RazorpayOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
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

  const orderRes = await createBillingOrder(plan);
  if (!orderRes.success) {
    throw new Error(orderRes.message || 'Could not create order');
  }

  const order = orderRes.data;
  const user = useAuthStore.getState().user;
  const key =
    order.keyId ||
    (import.meta.env.VITE_RAZORPAY_KEY_ID as string | undefined) ||
    '';

  if (!key) {
    throw new Error('Razorpay key is not configured');
  }

  return new Promise<CheckoutResult>((resolve, reject) => {
    let settled = false;

    const rzp = new window.Razorpay!({
      key,
      amount: order.amount,
      currency: order.currency,
      name: 'Cosmo',
      description: plan === 'pro' ? 'Pro plan — 1 month' : 'Max plan — 1 month',
      order_id: order.orderId,
      prefill: {
        name: user?.name,
        email: user?.email,
      },
      theme: { color: '#0f172a' },
      handler: (response) => {
        void (async () => {
          try {
            const verifyRes = await verifyBillingPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              plan,
            });
            if (!verifyRes.success) {
              throw new Error(verifyRes.message || 'Payment verification failed');
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
            resolve(verifyRes.data);
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

export async function downloadPaymentInvoice(paymentId: string): Promise<void> {
  await downloadInvoice(paymentId);
}

export async function previewPaymentInvoice(paymentId: string): Promise<string> {
  return previewInvoice(paymentId);
}
