const { execFileSync } = require("node:child_process");
const path = require("node:path");

// electron-builder skips signing entirely when no "Developer ID Application"
// certificate is installed. On Apple Silicon, an entirely unsigned .app fails
// Gatekeeper's quarantine check with a "damaged and can't be opened" error as
// soon as it's downloaded through a browser. An ad-hoc signature (no paid
// Apple Developer account needed) is enough to turn that into the normal,
// bypassable "unidentified developer" warning.
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;

  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", appPath], { stdio: "inherit" });
};
