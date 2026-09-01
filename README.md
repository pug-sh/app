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

## License

Pug UI is licensed under the [GNU AGPL v3.0](LICENSE). Everyone with work in a pull
request signs the [Contributor License Agreement](CLA.md) before it can merge —
comment `/sign`, on its own, on the pull request and that is done.
