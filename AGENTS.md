# 雾中纪事

- Stack: JavaScript, React, Vite, native CSS, and CSS Modules.
- This template is intentionally JavaScript-only. Use a different initializer when TypeScript is required.
- Commands: `npm run dev`, `npm run lint`, `npm run build`, and `npm run preview`.
- Keep global CSS limited to reset, tokens, typography, document background, and shared layout primitives.
- Keep component-specific styles in `*.module.css`.
- Do not add Tailwind CSS, a router, a UI framework, or decorative dependencies unless the requested feature needs them.
- Reuse the running development server and the installed dependency state.
- Run targeted checks during iteration and run lint plus the production build once at final handoff.
- Keep API transport, AI protocol parsing, local tool validation, memory, save data, and UI in separate modules.
- Never persist API keys inside game state or exported save files.
