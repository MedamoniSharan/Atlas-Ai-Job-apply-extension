import { FormEvent, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createAdminBanner,
  deleteAdminBanner,
  fetchAdminBanners,
  updateAdminBanner,
  type AdminSiteBanner,
} from '../lib/api';
import { CosmosLoader } from '../components/CosmosLogo';

const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';
const MAX_DATA_URL = 320_000;
/** Every banner is saved as the same JPEG canvas size. */
const BANNER_WIDTH = 1200;
const BANNER_HEIGHT = 480;

async function normalizeBannerToJpeg(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please drop a PNG, JPEG, WebP, or GIF image');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not decode image'));
      el.src = objectUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = BANNER_WIDTH;
    canvas.height = BANNER_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not process image');

    // Fill the standard banner canvas (cover) so every slide is the same wide format.
    ctx.fillStyle = '#f3f4f6';
    ctx.fillRect(0, 0, BANNER_WIDTH, BANNER_HEIGHT);

    const scale = Math.max(
      BANNER_WIDTH / Math.max(img.width, 1),
      BANNER_HEIGHT / Math.max(img.height, 1)
    );
    const drawW = Math.max(1, Math.round(img.width * scale));
    const drawH = Math.max(1, Math.round(img.height * scale));
    const dx = Math.round((BANNER_WIDTH - drawW) / 2);
    const dy = Math.round((BANNER_HEIGHT - drawH) / 2);
    ctx.drawImage(img, dx, dy, drawW, drawH);

    let q = 0.82;
    let dataUrl = canvas.toDataURL('image/jpeg', q);
    while (dataUrl.length > MAX_DATA_URL && q > 0.4) {
      q -= 0.08;
      dataUrl = canvas.toDataURL('image/jpeg', q);
    }
    if (dataUrl.length > MAX_DATA_URL) {
      throw new Error('Image is still too large — try a simpler graphic');
    }
    return dataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function BannerDropzone({
  value,
  onChange,
  disabled,
  allowClear = true,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
  disabled?: boolean;
  allowClear?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function applyFile(file: File | undefined | null) {
    if (!file || disabled) return;
    setLocalError(null);
    try {
      onChange(await normalizeBannerToJpeg(file));
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Upload failed');
    }
  }

  return (
    <div className="admin-field">
      <span>Banner image (drag & drop)</span>
      <div
        className={`admin-dropzone admin-dropzone--wide${
          dragging ? ' is-dragging' : ''
        }${value ? ' has-image' : ''}`}
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
            className="admin-dropzone__preview admin-dropzone__preview--wide"
            src={value}
            alt="Banner preview"
            draggable={false}
          />
        ) : (
          <p className="admin-dropzone__hint">
            Drop a wide promo image — saved as 1200×480 JPEG (fills the banner)
          </p>
        )}
      </div>
      {localError ? <p className="admin-error">{localError}</p> : null}
      {value && allowClear ? (
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

type BannerDraft = {
  imageUrl: string;
  linkUrl: string;
  altText: string;
  priority: number;
  active: boolean;
};

function draftFromBanner(b: AdminSiteBanner): BannerDraft {
  return {
    imageUrl: b.imageUrl,
    linkUrl: b.linkUrl ?? '',
    altText: b.altText ?? '',
    priority: b.priority ?? 0,
    active: !!b.active,
  };
}

function BannerEditRow({
  banner,
  busy,
  onSave,
  onCancel,
}: {
  banner: AdminSiteBanner;
  busy: boolean;
  onSave: (body: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<BannerDraft>(() => draftFromBanner(banner));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(draftFromBanner(banner));
    setError(null);
  }, [banner]);

  function save() {
    if (!draft.imageUrl.trim()) {
      setError('Banner image is required');
      return;
    }
    setError(null);
    onSave({
      imageUrl: draft.imageUrl,
      linkUrl: draft.linkUrl.trim() || null,
      altText: draft.altText.trim() || null,
      priority: draft.priority,
      active: draft.active,
    });
  }

  return (
    <li className="admin-list__row admin-offer-row admin-banner-edit">
      <div className="admin-offer-row__main">
        <div className="admin-offer-row__title">
          <strong>Edit banner</strong>
          <span className="admin-offer-pill admin-offer-pill--on">Editing</span>
        </div>
        {error ? <p className="admin-error">{error}</p> : null}
        <BannerDropzone
          value={draft.imageUrl}
          disabled={busy}
          allowClear={false}
          onChange={(next) => {
            if (!next) return;
            setDraft((d) => ({ ...d, imageUrl: next }));
          }}
        />
        <label className="admin-field">
          Link URL (optional)
          <input
            value={draft.linkUrl}
            disabled={busy}
            onChange={(e) =>
              setDraft((d) => ({ ...d, linkUrl: e.target.value }))
            }
            placeholder="https://… or /#pricing"
          />
        </label>
        <label className="admin-field">
          Alt text (optional)
          <input
            value={draft.altText}
            disabled={busy}
            onChange={(e) =>
              setDraft((d) => ({ ...d, altText: e.target.value }))
            }
            placeholder="Independence Day sale"
          />
        </label>
        <div className="admin-limits-grid">
          <label className="admin-field">
            Priority
            <input
              type="number"
              value={draft.priority}
              disabled={busy}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  priority: Number(e.target.value) || 0,
                }))
              }
            />
          </label>
        </div>
        <div className="admin-check-row">
          <label className="admin-check">
            <input
              type="checkbox"
              checked={draft.active}
              disabled={busy}
              onChange={(e) =>
                setDraft((d) => ({ ...d, active: e.target.checked }))
              }
            />
            Show banner (off = don’t show)
          </label>
        </div>
        <div className="admin-list__actions admin-banner-edit__actions">
          <button
            type="button"
            className="dash-btn dash-btn--primary"
            disabled={busy}
            onClick={save}
          >
            {busy ? 'Saving…' : 'Save changes'}
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

export function AdminBannersPage() {
  const queryClient = useQueryClient();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [altText, setAltText] = useState('');
  const [priority, setPriority] = useState(0);
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ['admin', 'banners'],
    queryFn: async () => {
      const res = await fetchAdminBanners();
      if (!res.success) throw new Error(res.message);
      return res.data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!imageUrl) throw new Error('Banner image is required');
      const res = await createAdminBanner({
        imageUrl,
        linkUrl: linkUrl.trim() || null,
        altText: altText.trim() || null,
        priority,
        active,
      });
      if (!res.success) throw new Error(res.message);
      return res.data;
    },
    onSuccess: () => {
      setImageUrl(null);
      setLinkUrl('');
      setAltText('');
      setPriority(0);
      setActive(true);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'banners'] });
      void queryClient.invalidateQueries({ queryKey: ['public', 'banners'] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const patch = useMutation({
    mutationFn: async (input: {
      bannerId: string;
      body: Record<string, unknown>;
    }) => {
      const res = await updateAdminBanner(input.bannerId, input.body);
      if (!res.success) throw new Error(res.message);
      return res.data;
    },
    onSuccess: () => {
      setEditingId(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'banners'] });
      void queryClient.invalidateQueries({ queryKey: ['public', 'banners'] });
    },
  });

  const remove = useMutation({
    mutationFn: async (bannerId: string) => {
      const res = await deleteAdminBanner(bannerId);
      if (!res.success) throw new Error(res.message);
    },
    onSuccess: (_data, bannerId) => {
      if (editingId === bannerId) setEditingId(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'banners'] });
      void queryClient.invalidateQueries({ queryKey: ['public', 'banners'] });
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!imageUrl) {
      setError('Banner image is required');
      return;
    }
    create.mutate();
  }

  function badgeBits(b: AdminSiteBanner) {
    return [
      `priority ${b.priority ?? 0}`,
      b.linkUrl ? `link ${b.linkUrl}` : null,
      b.altText ? `alt: ${b.altText}` : null,
    ]
      .filter(Boolean)
      .join(' · ');
  }

  if (isLoading) {
    return (
      <CosmosLoader label="Loading banners…" className="cosmos-loader--inline" />
    );
  }

  return (
    <div className="admin-page">
      <p className="admin-note">
        Banners power the image carousel between the landing navbar and hero.
        Every upload is normalized to the same 1200×480 JPEG and fills the wide
        banner strip. Use a wide image (about 2.5:1) for best results. Use Edit to
        change image, link, alt text, or priority. Off = don’t show that slide.
      </p>

      <form className="admin-panel" onSubmit={onSubmit}>
        <h2>New banner</h2>
        {error ? <p className="admin-error">{error}</p> : null}
        <BannerDropzone
          value={imageUrl}
          onChange={setImageUrl}
          disabled={create.isPending}
        />
        <label className="admin-field">
          Link URL (optional)
          <input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://… or /#pricing"
          />
        </label>
        <label className="admin-field">
          Alt text (optional)
          <input
            value={altText}
            onChange={(e) => setAltText(e.target.value)}
            placeholder="Independence Day sale"
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
        </div>
        <div className="admin-check-row">
          <label className="admin-check">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            Show banner (off = don’t show)
          </label>
        </div>
        <button
          type="submit"
          className="dash-btn dash-btn--primary"
          disabled={create.isPending}
        >
          {create.isPending ? 'Creating…' : 'Create banner'}
        </button>
      </form>

      <div className="admin-panel">
        <h2>Current banners</h2>
        {data.length === 0 ? (
          <p className="muted">
            No banners yet. Upload one above to show the carousel under the
            navbar.
          </p>
        ) : (
          <ul className="admin-list">
            {data.map((b) =>
              editingId === b.bannerId ? (
                <BannerEditRow
                  key={b.bannerId}
                  banner={b}
                  busy={patch.isPending}
                  onCancel={() => setEditingId(null)}
                  onSave={(body) =>
                    patch.mutate({ bannerId: b.bannerId, body })
                  }
                />
              ) : (
                <li key={b.bannerId} className="admin-list__row admin-offer-row">
                  <div className="admin-offer-row__main">
                    <div className="admin-offer-row__title">
                      <img
                        className="admin-offer-thumb admin-offer-thumb--wide"
                        src={b.imageUrl}
                        alt=""
                        width={56}
                        height={28}
                        draggable={false}
                      />
                      <strong>{b.altText?.trim() || 'Banner slide'}</strong>
                      <span
                        className={`admin-offer-pill ${
                          b.active
                            ? 'admin-offer-pill--on'
                            : 'admin-offer-pill--off'
                        }`}
                      >
                        {b.active ? 'Showing' : 'Hidden'}
                      </span>
                    </div>
                    <p className="muted">{badgeBits(b)}</p>
                  </div>
                  <div className="admin-list__actions">
                    <label
                      className="admin-toggle"
                      title="Off = don’t show this banner on the landing page"
                    >
                      <input
                        type="checkbox"
                        checked={!!b.active}
                        disabled={patch.isPending}
                        onChange={() =>
                          patch.mutate({
                            bannerId: b.bannerId,
                            body: { active: !b.active },
                          })
                        }
                      />
                      <span className="admin-toggle__ui" aria-hidden />
                      <span className="admin-toggle__label">
                        {b.active ? 'Show banner' : "Don't show banner"}
                      </span>
                    </label>
                    <button
                      type="button"
                      className="dash-btn dash-btn--ghost"
                      disabled={patch.isPending}
                      onClick={() => setEditingId(b.bannerId)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="dash-btn dash-btn--ghost"
                      onClick={() => {
                        if (window.confirm('Delete this banner?')) {
                          remove.mutate(b.bannerId);
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
