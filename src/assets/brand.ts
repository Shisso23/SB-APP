/**
 * Brand assets.
 *
 * The master logo is a 1672x941 RGB PNG with a warm off-white background
 * (#FDFAF7) and no alpha channel, so it must sit on a light surface. Pages that
 * use it pair it with a light header rather than a dark bar.
 *
 * Imported (not `require`d) so bundling and the `no-var-requires` lint rule are
 * both satisfied.
 */
import logo from "./images/PREDICTXI football intelligence logo.png";

export const PREDICTXI_LOGO = logo;

/** Master aspect ratio (1672 / 941) so callers can reserve space without CLS. */
export const PREDICTXI_LOGO_ASPECT = 1672 / 941;

/** Brand name, used anywhere a human-readable name is rendered. */
export const BRAND_NAME = "PredictXI";

/** Primary product line shown under the wordmark. */
export const BRAND_TAGLINE = "Football Intelligence";

export default PREDICTXI_LOGO;