// Resolves the vendored charts' import of "../components/shimmering-text".
// That path is only valid in the registry author's src/charts/ layout; at our
// target (components/charts/) it lands here. A shim keeps the vendored files
// unmodified, so a re-add can't break the import again.
export * from '../shimmering-text'
