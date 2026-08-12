import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAdminPlans, updateAdminPlan } from '../lib/api';
import { CosmosLoader } from '../components/CosmosLogo';

type PlanForm = {
  name: string;
  description: string;
  amountPaise: number;
  compareAtPaise: number;
  featuresText: string;
  badge: string;
  highlighted: boolean;
  lockNote: string;
  active: boolean;
  monthlyApplies: number;
  monthlyScans: number;
  appliesPerHour: number;
  appliesPerDay: number;
  razorpayPlanId: string | null;
};

export function AdminPlansPage() {
  const queryClient = useQueryClient();
  const [forms, setForms] = useState<Record<string, PlanForm>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'plans'],
    queryFn: async () => {
      const res = await fetchAdminPlans();
      if (!res.success) throw new Error(res.message);
      return res.data;
    },
  });

  useEffect(() => {
    if (!data) return;
    const next: Record<string, PlanForm> = {};
    for (const p of data) {
      next[p.tier] = {
        name: p.name,
        description: p.description,
        amountPaise: p.amountPaise,
        compareAtPaise: p.compareAtPaise ?? 0,
        featuresText: (p.features ?? []).join('\n'),
        badge: p.badge ?? '',
        highlighted: Boolean(p.highlighted),
        lockNote: p.lockNote ?? '',
        active: p.active,
        monthlyApplies: p.limits.monthlyApplies,
        monthlyScans: p.limits.monthlyScans,
        appliesPerHour: p.limits.appliesPerHour,
        appliesPerDay: p.limits.appliesPerDay,
        razorpayPlanId: p.razorpayPlanId,
      };
    }
    setForms(next);
  }, [data]);

  const save = useMutation({
    mutationFn: async (tier: string) => {
      const f = forms[tier];
      if (!f) return;
      const features = f.featuresText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await updateAdminPlan(tier, {
        name: f.name,
        description: f.description,
        amountPaise: f.amountPaise,
        compareAtPaise: f.compareAtPaise || null,
        features,
        badge: f.badge.trim() || null,
        highlighted: f.highlighted,
        lockNote: f.lockNote.trim() || null,
        active: f.active,
        limits: {
          monthlyApplies: f.monthlyApplies,
          monthlyScans: f.monthlyScans,
          appliesPerHour: f.appliesPerHour,
          appliesPerDay: f.appliesPerDay,
        },
      });
      if (!res.success) throw new Error(res.message);
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'plans'] });
      void queryClient.invalidateQueries({ queryKey: ['public', 'plans'] });
    },
  });

  if (isLoading) {
    return <CosmosLoader label="Loading plans…" className="cosmos-loader--inline" />;
  }

  return (
    <div className="admin-page">
      <p className="admin-note">
        Edits here update pricing on the website, checkout, and apply limits.
        Price changes create a new Razorpay plan for <strong>new</strong>{' '}
        subscriptions.
      </p>
      <div className="admin-plans-grid">
        {(['free', 'pro', 'max'] as const).map((tier) => {
          const f = forms[tier];
          if (!f) return null;
          return (
            <section key={tier} className="admin-panel">
              <h2>{tier}</h2>
              <label className="admin-field">
                Name
                <input
                  value={f.name}
                  onChange={(e) =>
                    setForms((prev) => ({
                      ...prev,
                      [tier]: { ...f, name: e.target.value },
                    }))
                  }
                />
              </label>
              <label className="admin-field">
                Description
                <textarea
                  value={f.description}
                  rows={2}
                  onChange={(e) =>
                    setForms((prev) => ({
                      ...prev,
                      [tier]: { ...f, description: e.target.value },
                    }))
                  }
                />
              </label>
              <label className="admin-field">
                Price (paise)
                <input
                  type="number"
                  value={f.amountPaise}
                  disabled={tier === 'free'}
                  onChange={(e) =>
                    setForms((prev) => ({
                      ...prev,
                      [tier]: {
                        ...f,
                        amountPaise: Number(e.target.value) || 0,
                      },
                    }))
                  }
                />
              </label>
              <label className="admin-field">
                Compare-at / strike (paise)
                <input
                  type="number"
                  value={f.compareAtPaise}
                  disabled={tier === 'free'}
                  onChange={(e) =>
                    setForms((prev) => ({
                      ...prev,
                      [tier]: {
                        ...f,
                        compareAtPaise: Number(e.target.value) || 0,
                      },
                    }))
                  }
                />
              </label>
              <label className="admin-field">
                Features (one per line)
                <textarea
                  value={f.featuresText}
                  rows={5}
                  onChange={(e) =>
                    setForms((prev) => ({
                      ...prev,
                      [tier]: { ...f, featuresText: e.target.value },
                    }))
                  }
                />
              </label>
              <label className="admin-field">
                Badge
                <input
                  value={f.badge}
                  onChange={(e) =>
                    setForms((prev) => ({
                      ...prev,
                      [tier]: { ...f, badge: e.target.value },
                    }))
                  }
                  placeholder="Popular"
                />
              </label>
              <label className="admin-field">
                Lock note
                <input
                  value={f.lockNote}
                  onChange={(e) =>
                    setForms((prev) => ({
                      ...prev,
                      [tier]: { ...f, lockNote: e.target.value },
                    }))
                  }
                />
              </label>
              <label className="admin-check">
                <input
                  type="checkbox"
                  checked={f.highlighted}
                  onChange={(e) =>
                    setForms((prev) => ({
                      ...prev,
                      [tier]: { ...f, highlighted: e.target.checked },
                    }))
                  }
                />
                Highlighted card
              </label>
              <div className="admin-limits-grid">
                {(
                  [
                    ['monthlyApplies', 'Monthly applies'],
                    ['monthlyScans', 'Monthly scans'],
                    ['appliesPerHour', 'Per hour'],
                    ['appliesPerDay', 'Per day'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="admin-field">
                    {label}
                    <input
                      type="number"
                      value={f[key]}
                      onChange={(e) =>
                        setForms((prev) => ({
                          ...prev,
                          [tier]: {
                            ...f,
                            [key]: Number(e.target.value) || 0,
                          },
                        }))
                      }
                    />
                  </label>
                ))}
              </div>
              <label className="admin-check">
                <input
                  type="checkbox"
                  checked={f.active}
                  onChange={(e) =>
                    setForms((prev) => ({
                      ...prev,
                      [tier]: { ...f, active: e.target.checked },
                    }))
                  }
                />
                Active in checkout
              </label>
              <p className="muted admin-razorpay-id">
                Razorpay plan: {f.razorpayPlanId || 'not linked yet'}
              </p>
              <button
                type="button"
                className="dash-btn dash-btn--primary"
                disabled={save.isPending}
                onClick={() => save.mutate(tier)}
              >
                Save {tier}
              </button>
            </section>
          );
        })}
      </div>
      {save.error ? (
        <p className="admin-error">{save.error.message}</p>
      ) : null}
      {save.isSuccess ? (
        <p className="admin-ok">Plan saved.</p>
      ) : null}
    </div>
  );
}
