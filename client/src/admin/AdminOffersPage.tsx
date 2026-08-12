import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createAdminOffer,
  deleteAdminOffer,
  fetchAdminOffers,
  updateAdminOffer,
} from '../lib/api';
import { CosmosLoader } from '../components/CosmosLogo';

export function AdminOffersPage() {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [priority, setPriority] = useState(0);
  const [active, setActive] = useState(true);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ['admin', 'offers'],
    queryFn: async () => {
      const res = await fetchAdminOffers();
      if (!res.success) throw new Error(res.message);
      return res.data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const res = await createAdminOffer({
        message: message.trim(),
        couponCode: couponCode.trim() || null,
        linkUrl: linkUrl.trim() || null,
        priority,
        active,
        startsAt: startsAt ? new Date(startsAt).toISOString() : null,
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
      });
      if (!res.success) throw new Error(res.message);
      return res.data;
    },
    onSuccess: () => {
      setMessage('');
      setCouponCode('');
      setLinkUrl('');
      setPriority(0);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'offers'] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const toggle = useMutation({
    mutationFn: async (offer: { offerId: string; active: boolean }) => {
      const res = await updateAdminOffer(offer.offerId, {
        active: !offer.active,
      });
      if (!res.success) throw new Error(res.message);
    },
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['admin', 'offers'] }),
  });

  const remove = useMutation({
    mutationFn: async (offerId: string) => {
      const res = await deleteAdminOffer(offerId);
      if (!res.success) throw new Error(res.message);
    },
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['admin', 'offers'] }),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!message.trim()) {
      setError('Message is required');
      return;
    }
    create.mutate();
  }

  if (isLoading) {
    return (
      <CosmosLoader label="Loading offers…" className="cosmos-loader--inline" />
    );
  }

  return (
    <div className="admin-page">
      <p className="admin-note">
        Active offers appear as a scrolling banner at the top of the site. Optional
        coupon codes are shown for marketing — users still apply them at checkout.
      </p>

      <form className="admin-panel" onSubmit={onSubmit}>
        <h2>New offer</h2>
        {error ? <p className="admin-error">{error}</p> : null}
        <label className="admin-field">
          Message
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Independence Day — 40% off Pro/Max"
            required
          />
        </label>
        <label className="admin-field">
          Coupon code (optional)
          <input
            value={couponCode}
            onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
            placeholder="INDY40"
          />
        </label>
        <label className="admin-field">
          Link URL (optional)
          <input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://…"
          />
        </label>
        <div className="admin-limits-grid">
          <label className="admin-field">
            Priority
            <input
              type="number"
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value) || 0)}
            />
          </label>
          <label className="admin-field">
            Starts
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </label>
          <label className="admin-field">
            Ends
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
            />
          </label>
        </div>
        <label className="admin-check">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          Active
        </label>
        <button
          type="submit"
          className="dash-btn dash-btn--primary"
          disabled={create.isPending}
        >
          {create.isPending ? 'Creating…' : 'Create offer'}
        </button>
      </form>

      <div className="admin-panel">
        <h2>Current offers</h2>
        {data.length === 0 ? (
          <p className="muted">No offers yet.</p>
        ) : (
          <ul className="admin-list">
            {data.map((o) => (
              <li key={o.offerId} className="admin-list__row">
                <div>
                  <strong>{o.message}</strong>
                  <p className="muted">
                    {o.couponCode ? `Code ${o.couponCode} · ` : ''}
                    priority {o.priority ?? 0} ·{' '}
                    {o.active ? 'active' : 'inactive'}
                  </p>
                </div>
                <div className="admin-list__actions">
                  <button
                    type="button"
                    className="dash-btn dash-btn--ghost"
                    onClick={() => toggle.mutate(o)}
                  >
                    {o.active ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    type="button"
                    className="dash-btn dash-btn--ghost"
                    onClick={() => {
                      if (window.confirm('Delete this offer?')) {
                        remove.mutate(o.offerId);
                      }
                    }}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
