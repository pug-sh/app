# Pug UI

Dashboard frontend for **Pug** — an analytics + communication platform. Built for growth managers.

## Stack

- React + TypeScript + Vite
- ConnectRPC (binary protobuf)
- Jotai (state management)
- shadcn/ui + Tailwind CSS

## Getting Started

```sh
bun install
bun run dev
```

## Commands

```sh
bun run dev       # Start dev server
bun run build     # Type-check + production build
bun run generate  # Regenerate TypeScript proto types from backend protos
bun run format    # Biome formatter (format only)
bun run lint      # Biome check — format + lint + import organization (safe fixes)
```

## Contributing

Pug UI is licensed under the [GNU AGPL v3.0](LICENSE). Before your first pull request is merged
you'll be asked to sign the [Contributor License Agreement](CLA.md). Signing is a commit: add
yourself to [`cla/signatures.json`](cla/signatures.json) in the same pull request. The CLA check
prints the entry for you with your GitHub id already filled in, so the simplest path is to open the
pull request and copy what the check tells you. You do it once per CLA version.

A `Co-authored-by:` trailer naming a person means they have to sign too, in a pull request of their
own — use a GitHub noreply address (`<login>@users.noreply.github.com`, or the `<id>+<login>` form
GitHub writes itself), since that is the only shape the check can resolve to an account. A trailer naming a
recognised AI assistant address (currently `noreply@anthropic.com`) is ignored.
