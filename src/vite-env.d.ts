/// <reference types="vite/client" />
/// <reference types="vite-plugin-svgr/client" />

export {};

declare module "react" {
  interface HTMLAttributes {
    // React 18 limitation: does not accept boolean
    inert?: "true";
  }
}
