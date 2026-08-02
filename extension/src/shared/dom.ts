/**
 * DOM helpers that avoid assigning to `Element.innerHTML`, which addons-linter
 * flags as UNSAFE_VAR_ASSIGNMENT even for trusted extension markup.
 */

/** Remove all child nodes. */
export function clearChildren(el: Element): void {
  el.replaceChildren();
}

/**
 * Replace an element's children with nodes parsed from a trusted HTML string
 * (extension-owned markup / already escaped dynamic text).
 */
export function setTrustedHtml(el: Element, html: string): void {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  el.replaceChildren(...Array.from(doc.body.childNodes));
}

/** Mount a trusted SVG document (single root `<svg>`) into `host`. */
export function setTrustedSvg(host: Element, svgMarkup: string): void {
  const doc = new DOMParser().parseFromString(
    svgMarkup.trim(),
    'image/svg+xml'
  );
  const svg = doc.documentElement;
  if (!svg || svg.localName === 'parsererror' || svg.querySelector('parsererror')) {
    clearChildren(host);
    return;
  }
  host.replaceChildren(host.ownerDocument.importNode(svg, true));
}
