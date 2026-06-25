## onebot-v11
参考文档: https://github.com/botuniverse/onebot-11 （clone 到本地后查看）

## Tech Stack
- **Ink** (React for terminal) — renders UI in the terminal
- **ink-text-input** — text input component with cursor navigation and IME support
- **ws** — WebSocket client for OneBot v11 protocol

## Product / UI Direction
- qq-cli should feel like a terminal productivity workspace, not a conventional chat app.
- Visual references: Codex/OpenCode terminal UI, IRC compact mode, and structured log viewers.
- Keep the UI dark, compact, text-first, and command-driven.
- Reduce obvious social/chat affordances: avoid chat bubbles, large avatars, colorful stickers, and prominent contact cards.
- Prefer neutral CLI language such as session, prompt, composer, input, status, and log.
- Keep QQ-specific details readable but visually restrained, especially group names, friend names, and message metadata.
- Compress CQ segments into short log-like tokens such as `[image]`, `[reply]`, `[voice]`, and `@123456`.
- Layout must protect the composer from message wrapping issues: headers, names, previews, and message bodies should be clipped or constrained rather than resizing the input area.
- If `.local/ui-reference/` exists, inspect its local-only screenshots and notes for UI direction before making visual changes.

## Commit Messages
- Use conventional commit types in English, such as `feat`, `fix`, `refactor`, `docs`, `test`, and `chore`.
- Add a scope only when the touched module is clear and large enough to make the scope useful, for example `feat(app): ...`.
- Write the message after the colon in Chinese, for example `feat: 拆分终端 UI 组件`.
