"""Cosmo tax invoice PDF template (matches server invoice.service.ts)."""

from __future__ import annotations

from datetime import datetime
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, Optional

from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

INK = "#121212"
MUTED = "#777169"
BRAND = "#15362b"
LINE = "#e5e5e5"
SOFT = "#f4f4f2"
WHITE = "#ffffff"
BRAND_MUTED = "#c5d4ce"

# DejaVu includes ₹ (Helvetica does not). Bundled under fonts/.
_FONT_DIR = Path(__file__).resolve().parent / "fonts"
_FONTS_READY = False


def _ensure_fonts() -> None:
    global _FONTS_READY
    if _FONTS_READY:
        return
    pdfmetrics.registerFont(TTFont("DejaVu", str(_FONT_DIR / "DejaVuSans.ttf")))
    pdfmetrics.registerFont(TTFont("DejaVu-Bold", str(_FONT_DIR / "DejaVuSans-Bold.ttf")))
    _FONTS_READY = True

# Cosmo mark path (viewBox 0 0 24 24) — same as client CosmosLogo
COSMO_MARK_PATH = (
    "M12 8.145c1.715 0 3.107-1.375 3.107-3.072S13.717 2 12 2 "
    "8.893 3.375 8.893 5.072 10.283 8.145 12 8.145"
    "M12 22c1.715 0 3.107-1.375 3.107-3.072s-1.39-3.073-3.107-3.073"
    "-3.107 1.376-3.107 3.073S10.283 22 12 22"
    "M6.004 11.646c1.716 0 3.107-1.375 3.107-3.072S7.721 5.5 6.004 5.5 "
    "2.897 6.877 2.897 8.575s1.39 3.072 3.107 3.072"
    "M17.996 18.492c1.715 0 3.107-1.375 3.107-3.072s-1.39-3.073-3.107-3.073"
    "-3.107 1.376-3.107 3.073 1.39 3.072 3.107 3.072"
    "M17.996 11.646c1.715 0 3.107-1.374 3.107-3.072s-1.39-3.072-3.107-3.072"
    "-3.107 1.374-3.107 3.072 1.39 3.072 3.107 3.072"
    "M6.004 18.492c1.716 0 3.107-1.375 3.107-3.073s-1.39-3.072-3.107-3.072"
    "-3.107 1.378-3.107 3.074 1.39 3.072 3.107 3.072z"
)


def _as_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _parse_date(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, (int, float)):
        # unix seconds
        try:
            return datetime.utcfromtimestamp(value)
        except (OverflowError, OSError, ValueError):
            return None
    text = str(value).strip()
    if not text:
        return None
    # ISO / Dynamo common forms
    for fmt in (
        "%Y-%m-%dT%H:%M:%S.%fZ",
        "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%d",
    ):
        try:
            return datetime.strptime(text.replace("+00:00", "Z"), fmt)
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).replace(
            tzinfo=None
        )
    except ValueError:
        return None


def format_inr(amount_paise: int) -> str:
    return f"₹{(amount_paise / 100):.2f}"


def format_date(value: Any) -> str:
    dt = _parse_date(value)
    if not dt:
        return str(value or "—")
    return dt.strftime("%d %b %Y")


def plan_label(plan: Any) -> str:
    p = str(plan or "").lower()
    if p == "pro":
        return "Premium Plan"
    if p == "max":
        return "UltraMag Plan"
    return f"{str(plan).title()} Plan" if plan else "Subscription"


def _draw_cosmo_mark(c: canvas.Canvas, x: float, y: float, size: float, color: str) -> None:
    """Draw the Cosmo 6-dot mark approximating the product logo."""
    from reportlab.graphics.shapes import Circle, Drawing
    from reportlab.graphics import renderPDF
    from reportlab.lib.colors import Color, HexColor

    fill = HexColor(color) if isinstance(color, str) and color.startswith("#") else color
    scale = size / 24.0
    d = Drawing(size, size)
    dots = [
        (12, 5.07),
        (12, 18.93),
        (6.0, 8.57),
        (18.0, 15.42),
        (18.0, 8.57),
        (6.0, 15.42),
    ]
    for cx, cy in dots:
        d.add(
            Circle(
                cx * scale,
                (24 - cy) * scale,
                2.2 * scale,
                fillColor=fill,
                strokeColor=None,
            )
        )
    renderPDF.draw(d, c, x, y)


def build_invoice_pdf(payload: Dict[str, Any]) -> bytes:
    """Render a branded Cosmo tax invoice PDF and return bytes."""
    _ensure_fonts()
    invoice_number = str(payload.get("invoiceNumber") or "COSMO-UNKNOWN")
    customer_name = str(payload.get("customerName") or "Customer")
    customer_email = str(payload.get("customerEmail") or "")
    plan = payload.get("plan")
    amount_paise = _as_int(payload.get("amountPaise"))
    currency = str(payload.get("currency") or "INR")
    period_start = payload.get("periodStart")
    period_end = payload.get("periodEnd")
    paid_at = payload.get("paidAt") or period_start
    order_id = str(
        payload.get("razorpayOrderId")
        or payload.get("razorpaySubscriptionId")
        or "—"
    )
    payment_id = str(payload.get("razorpayPaymentId") or "—")
    amount_text = format_inr(amount_paise)

    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    page_w, page_h = A4
    left = 48
    right = page_w - 48
    content_w = right - left

    # —— Watermarks ——
    c.saveState()
    c.setFillColor(BRAND)
    c.setFillAlpha(0.05)
    c.setFont("Helvetica-Bold", 96)
    c.translate(page_w / 2, page_h / 2)
    c.rotate(-28)
    c.drawCentredString(0, -20, "COSMO")
    c.restoreState()

    c.saveState()
    c.setFillColor(BRAND)
    c.setFillAlpha(0.06)
    c.setFont("Helvetica-Bold", 64)
    c.translate(page_w / 2, 160)
    c.rotate(-18)
    c.drawCentredString(0, 0, "PAID")
    c.restoreState()

    # —— Brand header ——
    c.setFillColor(BRAND)
    c.rect(0, page_h - 96, page_w, 96, fill=1, stroke=0)

    mark_size = 34
    mark_x = left
    mark_y = page_h - 96 + 31
    _draw_cosmo_mark(c, mark_x, mark_y - 4, mark_size, WHITE)

    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", 26)
    c.drawString(mark_x + mark_size + 10, page_h - 96 + 50, "cosmo")
    c.setFont("Helvetica", 10)
    c.setFillColor(BRAND_MUTED)
    c.drawString(mark_x + mark_size + 10, page_h - 96 + 34, "by cosmovai")

    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", 18)
    c.drawRightString(right, page_h - 96 + 52, "TAX INVOICE")
    c.setFont("Helvetica", 9)
    c.setFillColor(BRAND_MUTED)
    c.drawRightString(right, page_h - 96 + 36, "Paid · Digital receipt")

    # —— Soft meta strip ——
    c.setFillColor(SOFT)
    c.rect(0, page_h - 96 - 56, page_w, 56, fill=1, stroke=0)

    meta_y = page_h - 96 - 24
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 9)
    c.drawString(left, meta_y + 14, "Invoice number")
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(left, meta_y, invoice_number)

    c.setFillColor(MUTED)
    c.setFont("Helvetica", 9)
    c.drawString(left + 200, meta_y + 14, "Invoice date")
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(left + 200, meta_y, format_date(paid_at))

    c.setFillColor(MUTED)
    c.setFont("Helvetica", 9)
    c.drawString(left + 360, meta_y + 14, "Status")
    c.setFillColor(BRAND)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(left + 360, meta_y, "PAID")

    # —— From / Bill to ——
    y = page_h - 176
    _draw_cosmo_mark(c, left, y - 8, 18, BRAND)

    c.setFillColor(MUTED)
    c.setFont("Helvetica", 9)
    c.drawString(left + 26, y, "From")
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(left + 26, y - 16, "cosmovai")
    c.setFont("Helvetica", 10)
    c.setFillColor(MUTED)
    c.drawString(left + 26, y - 32, "AI job apply automation")
    c.drawString(left + 26, y - 46, "support@cosmovai.com")

    c.setFillColor(MUTED)
    c.setFont("Helvetica", 9)
    c.drawString(left + 280, y, "Bill to")
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(left + 280, y - 16, customer_name[:42])
    c.setFont("Helvetica", 10)
    c.setFillColor(MUTED)
    c.drawString(left + 280, y - 32, customer_email[:48])

    # —— Line items table ——
    y = page_h - 270
    c.setFillColor(BRAND)
    c.rect(left, y - 8, content_w, 28, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(left + 12, y + 2, "DESCRIPTION")
    c.drawString(left + 250, y + 2, "PERIOD")
    c.drawRightString(right - 12, y + 2, "AMOUNT")

    y -= 28
    row_h = 52
    c.setFillColor(WHITE)
    c.rect(left, y - row_h + 20, content_w, row_h, fill=1, stroke=0)
    c.setStrokeColor(LINE)
    c.setLineWidth(1)
    c.line(left, y - row_h + 20, right, y - row_h + 20)

    period = f"{format_date(period_start)} – {format_date(period_end)}"
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(left + 12, y - 4, plan_label(plan))
    c.setFont("Helvetica", 9)
    c.setFillColor(MUTED)
    c.drawString(left + 12, y - 20, "Subscription · 1 month access")
    c.setFillColor(INK)
    c.setFont("Helvetica", 10)
    c.drawString(left + 250, y - 10, period)
    c.setFont("DejaVu-Bold", 11)
    c.drawRightString(right - 12, y - 10, amount_text)

    # —— Totals ——
    y = y - row_h - 10
    totals_x = left + content_w - 220
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 10)
    c.drawString(totals_x, y, "Subtotal")
    c.setFillColor(INK)
    c.setFont("DejaVu", 10)
    c.drawRightString(right, y, amount_text)
    y -= 18
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 10)
    c.drawString(totals_x, y, "Tax / GST")
    c.setFillColor(INK)
    c.drawRightString(right, y, "Included")
    y -= 22
    c.setFillColor(SOFT)
    c.rect(totals_x - 8, y - 10, 228, 36, fill=1, stroke=0)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(totals_x, y + 6, "Total paid")
    c.setFillColor(BRAND)
    c.setFont("DejaVu-Bold", 14)
    c.drawRightString(right - 4, y + 5, amount_text)

    # —— Payment details ——
    y -= 56
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(left, y, "Payment details")
    y -= 18
    c.setFont("Helvetica", 9)
    c.setFillColor(MUTED)
    c.drawString(left, y, "Gateway: Razorpay")
    y -= 14
    c.drawString(left, y, f"Order ID: {order_id}")
    y -= 14
    c.drawString(left, y, f"Payment ID: {payment_id}")
    y -= 14
    c.drawString(left, y, f"Currency: {currency}")

    # —— Notes ——
    y -= 28
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(left, y, "Notes")
    y -= 16
    c.setFont("Helvetica", 9)
    c.setFillColor(MUTED)
    note = (
        "This is a computer-generated invoice for your Cosmo subscription. "
        "No physical signature is required. For billing help, email support@cosmovai.com."
    )
    text_obj = c.beginText(left, y)
    text_obj.setFont("Helvetica", 9)
    text_obj.setFillColor(MUTED)
    # wrap manually
    words = note.split()
    line = ""
    max_w = content_w
    for w in words:
        trial = f"{line} {w}".strip()
        if c.stringWidth(trial, "Helvetica", 9) > max_w:
            text_obj.textLine(line)
            line = w
        else:
            line = trial
    if line:
        text_obj.textLine(line)
    c.drawText(text_obj)

    # —— Footer ——
    c.setStrokeColor(LINE)
    c.line(left, 56, right, 56)
    c.setFont("Helvetica", 8)
    c.setFillColor(MUTED)
    c.drawCentredString(
        page_w / 2,
        42,
        "cosmovai · cosmo job apply assistant · Thank you for your purchase.",
    )

    c.showPage()
    c.save()
    return buf.getvalue()
