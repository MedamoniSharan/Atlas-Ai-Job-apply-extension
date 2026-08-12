import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PaidPlan } from '@cosmo/shared';
import {
  createAdminCoupon,
  deleteAdminCoupon,
  fetchAdminCoupons,
  updateAdminCoupon,
} from '../lib/api';
import { CosmosLoader } from '../components/CosmosLogo';

export function AdminCouponsPage() {
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [type, setType] = useState<'percent' | 'fixedPaise'>('percent');
  const [value, setValue] = useState(40);
  const [plans, setPlans] = useState<PaidPlan[]>(['pro', 'max']);
  const [maxRedemptions, setMaxRedemptions] = useState('');
  const [perUserLimit, setPerUserLimit] = useState(1);
  const [description, setDescription] = useState('');
  const [active, setActive] = useState(true);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ['admin', 'coupons'],
    queryFn: async () => {
      const res = await fetchAdminCoupons();
      if (!res.success) throw new Error(res.message);
      return res.data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const res = await createAdminCoupon({
        code: code.trim().toUpperCase(),
        type,
        value,
        applicablePlans: plans,
        maxRedemptions: maxRedemptions
          ? Number(maxRedemptions)
          : null,
        perUserLimit,
        description: description.trim() || null,
        active,
        startsAt: startsAt ? new Date(startsAt).toISOString() : null,
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
      });
      if (!res.success) throw new Error(res.message);
      return res.data;
    },
    onSuccess: () => {
      setCode('');
      setDescription('');
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'coupons'] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const toggle = useMutation({
    mutationFn: async (c: { code: string; active: boolean }) => {
      const res = await updateAdminCoupon(c.code, { active: !c.active });
      if (!res.success) throw new Error(res.message);
    },
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['admin', 'coupons'] }),
  });

  const remove = useMutation({
    mutationFn: async (c: string) => {
      const res = await deleteAdminCoupon(c);
      if (!res.success) throw new Error(res.message);
    },
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['admin', 'coupons'] }),
  });

  function togglePlan(p: PaidPlan) {
    setPlans((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!code.trim() || plans.length === 0) {
      setError('Code and at least one plan are required');
      return;
    }
    create.mutate();
  }

  if (isLoading) {
    return (
      <CosmosLoader
        label="Loading coupons…"
        className="cosmos-loader--inline"
      />
    );
  }

  return (
    <div className="admin-page">
      <p className="admin-note">
        Coupons discount the first subscription billing cycle. Permanent list
        prices are managed under Plans.
      </p>

      <form className="admin-panel" onSubmit={onSubmit}>
        <h2>New coupon</h2>
        {error ? <p className="admin-error">{error}</p> : null}
        <label className="admin-field">
          Code
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="INDY40"
            required
          />
        </label>
        <div className="admin-limits-grid">
          <label className="admin-field">
            Type
            <select
              value={type}
              onChange={(e) =>
                setType(e.target.value as 'percent' | 'fixedPaise')
              }
            >
              <option value="percent">Percent</option>
              <option value="fixedPaise">Fixed (paise)</option>
            </select>
          </label>
          <label className="admin-field">
            Value
            <input
              type="number"
              value={value}
              min={1}
              onChange={(e) => setValue(Number(e.target.value) || 0)}
            />
          </label>
          <label className="admin-field">
            Max redemptions
            <input
              type="number"
              value={maxRedemptions}
              placeholder="Unlimited"
              onChange={(e) => setMaxRedemptions(e.target.value)}
            />
          </label>
          <label className="admin-field">
            Per-user limit
            <input
              type="number"
              value={perUserLimit}
              min={1}
              onChange={(e) => setPerUserLimit(Number(e.target.value) || 1)}
            />
          </label>
        </div>
        <fieldset className="admin-field">
          <legend>Applicable plans</legend>
          {(['pro', 'max'] as const).map((p) => (
            <label key={p} className="admin-check">
              <input
                type="checkbox"
                checked={plans.includes(p)}
                onChange={() => togglePlan(p)}
              />
              {p}
            </label>
          ))}
        </fieldset>
        <label className="admin-field">
          Description
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <div className="admin-limits-grid">
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
          {create.isPending ? 'Creating…' : 'Create coupon'}
        </button>
      </form>

      <div className="admin-panel">
        <h2>Coupons</h2>
        {data.length === 0 ? (
          <p className="muted">No coupons yet.</p>
        ) : (
          <ul className="admin-list">
            {data.map((c) => (
              <li key={c.code} className="admin-list__row">
                <div>
                  <strong>{c.code}</strong>
                  <p className="muted">
                    {c.type === 'percent'
                      ? `${c.value}% off`
                      : `₹${(c.value / 100).toFixed(0)} off`}{' '}
                    · {(c.applicablePlans || []).join(', ')} · used{' '}
                    {c.redemptionCount ?? 0}
                    {c.maxRedemptions != null
                      ? ` / ${c.maxRedemptions}`
                      : ''}{' '}
                    · {c.active ? 'active' : 'inactive'}
                  </p>
                </div>
                <div className="admin-list__actions">
                  <button
                    type="button"
                    className="dash-btn dash-btn--ghost"
                    onClick={() => toggle.mutate(c)}
                  >
                    {c.active ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    type="button"
                    className="dash-btn dash-btn--ghost"
                    onClick={() => {
                      if (window.confirm(`Delete coupon ${c.code}?`)) {
                        remove.mutate(c.code);
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
