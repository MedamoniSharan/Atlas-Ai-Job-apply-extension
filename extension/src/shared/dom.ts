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
 *
 * HTML5 parsing moves `<style>` / `<link>` into the document head, so those
 * must be copied explicitly — otherwise Cosmo panel CSS never mounts and the
 * floating side icon disappears on Naukri.
 */
export function setTrustedHtml(el: Element, html: string): void {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const nodes = [
    ...Array.from(doc.head.querySelectorAll('style, link')),
    ...Array.from(doc.body.childNodes),
  ].map((node) => el.ownerDocument.importNode(node, true));
  el.replaceChildren(...nodes);
}

/**
 * Mount a trusted SVG fragment into `host`.
 *
 * Parse as `text/html` (not `image/svg+xml`): Chrome gives XML-parsed SVGs a
 * null namespace and 0×0 layout unless xmlns is present, so pause/stop/minimize
 * icons disappear even though the buttons still exist.
 */
export function setTrustedSvg(host: Element, svgMarkup: string): void {
  const doc = new DOMParser().parseFromString(svgMarkup.trim(), 'text/html');
  const svg = doc.body.querySelector('svg');
  if (!svg || svg.querySelector('parsererror')) {
    clearChildren(host);
    return;
  }
  host.replaceChildren(host.ownerDocument.importNode(svg, true));
}
