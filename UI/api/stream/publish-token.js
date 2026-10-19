// POST (HTTP Basic, device credentials) → short-lived MediaMTX "publish" JWT for the Raspberry Pi.
import { withConfig, publishTokenRoute } from "../_lib/streamAuth.js";

const handle = withConfig(publishTokenRoute);
export { handle as POST };
