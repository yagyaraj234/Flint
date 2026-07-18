# Roast0
Agent trace roast tool. Hackathon build. Read PLAN.md, execute one stage at a time.

Commands: bun dev / bun test
Rules:
- strict TS, no `any` in src/lib
- src/lib/normalize and src/lib/analyze are pure, no framework or db imports
- acceptance check green before next stage, one commit per stage
- deps are fixed, ask before adding
- env values are server-only, never logged, never client-exposed
- no styling before stage 6
