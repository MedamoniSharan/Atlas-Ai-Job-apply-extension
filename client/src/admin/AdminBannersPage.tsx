import { FormEvent, useRef, useState } from 'react';
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

async function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Could not read image'));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => reject(new Error('Could not read image'));
    reader.readAsDataURL(file);
  });
}

async function compressToJpegDataUrl(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not decode image'));
      el.src = objectUrl;
    });
    const scale = Math.min(1, 1200 / Math.max(img.width, 1));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not process image');
    ctx.drawImage(img, 0, 0, w, h);

    let q = 0.72;
    let dataUrl = canvas.toDataURL('image/jpeg', q);
    while (dataUrl.length > MAX_DATA_URL && q > 0.35) {
      q -= 0.1;
      dataUrl = canvas.toDataURL('image/jpeg', q);
    }
    if (dataUrl.length > MAX_DATA_URL) {
      throw new Error('Image is still too large — try a smaller file');
    }
    return dataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function fileToCarouselDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please drop a PNG, JPEG, WebP, or GIF image');
  }
  if (file.size <= 180_000 && file.type === 'image/jpeg') {
    const raw = await readAsDataUrl(file);
    if (raw.length <= MAX_DATA_URL) return raw;
  }
  return compressToJpegDataUrl(file);
}

function BannerDropzone({
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
      onChange(await fileToCarouselDataUrl(file));
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
            Drop a wide promo image here, or click to browse
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

export function AdminBannersPage() {
  const queryClient = useQueryClient();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [altText, setAltText] = useState('');
  const [priority, setPriority] = useState(0);
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      void queryClient.invalidateQueries({ queryKey: ['admin', 'banners'] });
      void queryClient.invalidateQueries({ queryKey: ['public', 'banners'] });
    },
  });

  const remove = useMutation({
    mutationFn: async (bannerId: string) => {
      const res = await deleteAdminBanner(bannerId);
      if (!res.success) throw new Error(res.message);
    },
    onSuccess: () => {
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
      b.linkUrl ? 'has link' : null,
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
        Off = don’t show that slide. Mid-page print ribbons stay under Offers.
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
            {data.map((b) => (
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
                        b.active ? 'admin-offer-pill--on' : 'admin-offer-pill--off'
                      }`}
                    >
                      {b.active ? 'Showing' : 'Hidden'}
                    </span>
                  </div>
                  <p className="muted">{badgeBits(b)}</p>
                  <BannerDropzone
                    value={b.imageUrl}
                    disabled={patch.isPending}
                    onChange={(next) => {
                      if (!next) return;
                      patch.mutate({
                        bannerId: b.bannerId,
                        body: { imageUrl: next },
                      });
                    }}
                  />
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
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
