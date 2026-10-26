/** The Harness shell supplies the stylesheet imported by its published UI primitive declarations. */
declare module 'katex/dist/katex.min.css'

/** Images embedded in the client bundle by esbuild. */
declare module '*.webp' {
  const url: string
  export default url
}

/** Class names emitted by the package's CSS Modules compiler. */
declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
  export const cssText: string
}
