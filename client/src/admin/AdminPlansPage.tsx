import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAdminPlans, updateAdminPlan } from '../lib/api';
import { CosmosLoader } from '../components/CosmosLogo';

type PlanForm = {
  name: string;
  description: string;
  amountPaise: number;
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
      const res = await updateAdminPlan(tier, {
        name: f.name,
        description: f.description,
        amountPaise: f.amountPaise,
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
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['admin', 'plans'] }),
  });

  if (isLoading) {
    return <CosmosLoader label="Loading plans…" className="cosmos-loader--inline" />;
  }

  return (
    <div className="admin-page">
      <p className="admin-note">
        Price changes create a new Razorpay plan for <strong>new</strong>{' '}
        subscriptions. Existing subscribers stay on their current Razorpay plan
        id until they change or resubscribe.
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
