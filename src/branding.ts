/**
 * Single source of truth for the product's name and wordmark copy.
 *
 * Every user-visible string that names the product goes through here so a
 * rename is one edit rather than a hunt through components. The reader is
 * document-agnostic, so nothing in this file describes any particular Act.
 */

/** Product name. Used in the window title, header wordmark and footers. */
export const PRODUCT_NAME = 'StatuteGraph';

/** One-line positioning, shown under the wordmark. */
export const PRODUCT_TAGLINE = 'Statutory structure reader';

/**
 * Expanded form for the document title and README heading. "Structure" is the
 * honest claim: the reader indexes the hierarchy and the citation graph, it
 * does not interpret the law.
 */
export const PRODUCT_TITLE = `${PRODUCT_NAME} — ${PRODUCT_TAGLINE}`;

/** The studio behind the product, linked wherever the byline appears. */
export const AUTHOR_NAME = 'Utharam';
export const AUTHOR_URL = 'https://utharam.in/';

/**
 * Companion tool that turns a statute PDF into the JSON this reader accepts.
 * Kept as a constant so the two surfaces never drift apart.
 */
export const PARSER_NAME = 'LexParser';
export const PARSER_URL = 'https://lexparser.utharam.in/';

/** The catalogue blurb used on the landing page. */
export const PRODUCT_DESCRIPTION =
  'In-browser reader for dense statutes, acts and cross-referenced PDFs. Renders the provision hierarchy as a navigable graph, resolves every citation in both directions, and never uploads a document anywhere.';