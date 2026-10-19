// GET → public keys MediaMTX uses to verify stream JWTs (authJWTJWKS).
import { withConfig, jwksRoute } from "../_lib/streamAuth.js";

const handle = withConfig(jwksRoute);
export { handle as GET, handle as HEAD };
