import { FormEvent, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createAdminOffer,
  deleteAdminOffer,
  fetchAdminOffers,
  updateAdminOffer,
  type AdminSiteOffer,
} from '../lib/api';
import { CosmosLoader } from '../components/CosmosLogo';

const MAX_IMAGE_BYTES = 120_000;
const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';

/** datetime-local value from ISO (browser local timezone). */
function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocal(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function formatEndsLabel(iso: string | null | undefined): string {
  if (!iso) return 'no sale end';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'no sale end';
  return `Sale Ends ${new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d)} IST`;
}

async function fileToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please drop a PNG, JPEG, WebP, or GIF image');
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error('Ticker icon must be under 120KB');
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Could not read image'));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(new Error('Could not read image'));
    reader.readAsDataURL(file);
  });
}

function OfferImageDropzone({
  value,
  onChange,
  disabled,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function applyFile(file: File | undefined | null) {
    if (!file || disabled) return;
    setLocalError(null);
    try {
      onChange(await fileToDataUrl(file));
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Upload failed');
    }
  }

  return (
    <div className="admin-field">
      <span>Ticker icon (drag & drop)</span>
      <div
        className={`admin-dropzone${dragging ? ' is-dragging' : ''}${
          value ? ' has-image' : ''
        }`}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          setDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void applyFile(e.dataTransfer.files?.[0]);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          hidden
          disabled={disabled}
          onChange={(e) => {
            void applyFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        {value ? (
          <img
            className="admin-dropzone__preview"
            src={value}
            alt="Icon preview"
            draggable={false}
          />
        ) : (
          <p className="admin-dropzone__hint">
            Drop a small icon, or leave empty for the default bird
          </p>
        )}
      </div>
      {localError ? <p className="admin-error">{localError}</p> : null}
      {value ? (
        <button
          type="button"
          className="dash-btn dash-btn--ghost"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            onChange(null);
            setLocalError(null);
          }}
        >
          Remove image
        </button>
      ) : null}
    </div>
  );
}

export function AdminOffersPage() {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [priority, setPriority] = useState(0);
  const [showBird, setShowBird] = useState(true);
  const [showFlag, setShowFlag] = useState(true);
  const [active, setActive] = useState(true);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

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
        imageUrl,
        showBird,
        showFlag,
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
      setImageUrl(null);
      setPriority(0);
      setShowBird(true);
      setShowFlag(true);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'offers'] });
      void queryClient.invalidateQueries({ queryKey: ['public', 'offers'] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const patch = useMutation({
    mutationFn: async (input: {
      offerId: string;
      body: Record<string, unknown>;
    }) => {
      const res = await updateAdminOffer(input.offerId, input.body);
      if (!res.success) throw new Error(res.message);
      return res.data;
    },
    onSuccess: () => {
      setEditingId(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'offers'] });
      void queryClient.invalidateQueries({ queryKey: ['public', 'offers'] });
    },
  });

  const remove = useMutation({
    mutationFn: async (offerId: string) => {
      const res = await deleteAdminOffer(offerId);
      if (!res.success) throw new Error(res.message);
    },
    onSuccess: (_data, offerId) => {
      if (editingId === offerId) setEditingId(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'offers'] });
      void queryClient.invalidateQueries({ queryKey: ['public', 'offers'] });
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!message.trim()) {
      setError('Message is required');
      return;
    }
    create.mutate();
  }

  function badgeBits(o: AdminSiteOffer) {
    const bits = [
      o.couponCode ? `Code ${o.couponCode}` : null,
      `priority ${o.priority ?? 0}`,
      formatEndsLabel(o.endsAt),
      o.imageUrl ? 'custom icon' : 'default bird',
      o.showBird !== false ? 'image on' : 'image off',
      o.showFlag !== false ? 'flag' : 'no flag',
    ].filter(Boolean);
    return bits.join(' · ');
  }

  if (isLoading) {
    return (
      <CosmosLoader label="Loading offers…" className="cosmos-loader--inline" />
    );
  }

  return (
    <div className="admin-page">
      <p className="admin-note">
        Offers drive the top ticker and mid-page print ribbons. The ticker{' '}
        <strong>Sale Ends</strong> countdown uses this offer’s <strong>Ends</strong>{' '}
        date from admin. For the image carousel under the navbar, use{' '}
        <strong>Banners</strong>. Off = don’t show this offer.
      </p>

      <form className="admin-panel" onSubmit={onSubmit}>
        <h2>New offer</h2>
        {error ? <p className="admin-error">{error}</p> : null}
        <label className="admin-field">
          Message
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Independence Day Sale — 40% off Pro & Max"
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
        <OfferImageDropzone
          value={imageUrl}
          onChange={setImageUrl}
          disabled={create.isPending}
        />
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
            Ends (Sale Ends on ticker)
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
            />
          </label>
        </div>
        <div className="admin-check-row">
          <label className="admin-check">
            <input
              type="checkbox"
              checked={showBird}
              onChange={(e) => setShowBird(e.target.checked)}
            />
            Show ticker icon
          </label>
          <label className="admin-check">
            <input
              type="checkbox"
              checked={showFlag}
              onChange={(e) => setShowFlag(e.target.checked)}
            />
            Show Indian flag
          </label>
          <label className="admin-check">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            Show offer (off = don’t show)
          </label>
        </div>
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
          <p className="muted">
            No offers yet. Create one above to show the ticker and print ribbons.
          </p>
        ) : (
          <ul className="admin-list">
            {data.map((o) =>
              editingId === o.offerId ? (
                <OfferScheduleEdit
                  key={o.offerId}
                  offer={o}
                  busy={patch.isPending}
                  onCancel={() => setEditingId(null)}
                  onSave={(body) =>
                    patch.mutate({ offerId: o.offerId, body })
                  }
                />
              ) : (
                <li key={o.offerId} className="admin-list__row admin-offer-row">
                  <div className="admin-offer-row__main">
                    <div className="admin-offer-row__title">
                      {o.imageUrl ? (
                        <img
                          className="admin-offer-thumb"
                          src={o.imageUrl}
                          alt=""
                          width={28}
                          height={28}
                          draggable={false}
                        />
                      ) : null}
                      <strong>{o.message}</strong>
                      <span
                        className={`admin-offer-pill ${
                          o.active
                            ? 'admin-offer-pill--on'
                            : 'admin-offer-pill--off'
                        }`}
                      >
                        {o.active ? 'Showing' : 'Hidden'}
                      </span>
                    </div>
                    <p className="muted">{badgeBits(o)}</p>
                    <OfferImageDropzone
                      value={o.imageUrl ?? null}
                      disabled={patch.isPending}
                      onChange={(next) =>
                        patch.mutate({
                          offerId: o.offerId,
                          body: { imageUrl: next },
                        })
                      }
                    />
                  </div>
                  <div className="admin-list__actions">
                    <label
                      className="admin-toggle"
                      title="Off = don’t show this offer (ticker + print ribbons)"
                    >
                      <input
                        type="checkbox"
                        checked={!!o.active}
                        disabled={patch.isPending}
                        onChange={() =>
                          patch.mutate({
                            offerId: o.offerId,
                            body: { active: !o.active },
                          })
                        }
                      />
                      <span className="admin-toggle__ui" aria-hidden />
                      <span className="admin-toggle__label">
                        {o.active ? 'Show offer' : "Don't show offer"}
                      </span>
                    </label>
                    <button
                      type="button"
                      className="dash-btn dash-btn--ghost"
                      disabled={patch.isPending}
                      onClick={() => setEditingId(o.offerId)}
                    >
                      Edit schedule
                    </button>
                    <button
                      type="button"
                      className="dash-btn dash-btn--ghost"
                      onClick={() =>
                        patch.mutate({
                          offerId: o.offerId,
                          body: { showBird: o.showBird === false },
                        })
                      }
                    >
                      {o.showBird === false ? 'Icon on' : 'Icon off'}
                    </button>
                    <button
                      type="button"
                      className="dash-btn dash-btn--ghost"
                      onClick={() =>
                        patch.mutate({
                          offerId: o.offerId,
                          body: { showFlag: o.showFlag === false },
                        })
                      }
                    >
                      {o.showFlag === false ? 'Flag on' : 'Flag off'}
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
              )
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

function OfferScheduleEdit({
  offer,
  busy,
  onSave,
  onCancel,
}: {
  offer: AdminSiteOffer;
  busy: boolean;
  onSave: (body: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const [startsLocal, setStartsLocal] = useState(() =>
    toDatetimeLocal(offer.startsAt)
  );
  const [endsLocal, setEndsLocal] = useState(() => toDatetimeLocal(offer.endsAt));

  useEffect(() => {
    setStartsLocal(toDatetimeLocal(offer.startsAt));
    setEndsLocal(toDatetimeLocal(offer.endsAt));
  }, [offer]);

  return (
    <li className="admin-list__row admin-offer-row admin-banner-edit">
      <div className="admin-offer-row__main">
        <div className="admin-offer-row__title">
          <strong>Edit schedule — {offer.message}</strong>
          <span className="admin-offer-pill admin-offer-pill--on">Editing</span>
        </div>
        <p className="muted">
          Ends feeds the top ticker “Sale Ends” countdown. Clear Ends to hide it.
        </p>
        <div className="admin-limits-grid">
          <label className="admin-field">
            Starts
            <input
              type="datetime-local"
              value={startsLocal}
              disabled={busy}
              onChange={(e) => setStartsLocal(e.target.value)}
            />
          </label>
          <label className="admin-field">
            Ends (Sale Ends on ticker)
            <input
              type="datetime-local"
              value={endsLocal}
              disabled={busy}
              onChange={(e) => setEndsLocal(e.target.value)}
            />
          </label>
        </div>
        <div className="admin-list__actions admin-banner-edit__actions">
          <button
            type="button"
            className="dash-btn dash-btn--primary"
            disabled={busy}
            onClick={() =>
              onSave({
                startsAt: fromDatetimeLocal(startsLocal),
                endsAt: fromDatetimeLocal(endsLocal),
              })
            }
          >
            {busy ? 'Saving…' : 'Save schedule'}
          </button>
          <button
            type="button"
            className="dash-btn dash-btn--ghost"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </li>
  );
}
