// GET → current operator · POST → sign in · DELETE → sign out. See api/_lib/streamAuth.js.
import { withConfig, sessionRoute } from "../_lib/streamAuth.js";

const handle = withConfig(sessionRoute);
export { handle as GET, handle as POST, handle as DELETE };
