// Use the public ESM entrypoint; the tsr binary loads the CJS build, whose
// router-core cycle reads replaceRouteChunk before it has been initialized.
import "@tanstack/router-cli";
