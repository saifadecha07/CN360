// POST → short-lived MediaMTX "read" JWT + WHEP URL for a signed-in operator.
import { withConfig, viewTokenRoute } from "../_lib/streamAuth.js";

const handle = withConfig(viewTokenRoute);
export { handle as POST };
