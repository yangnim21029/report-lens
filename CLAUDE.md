# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Core Development
- `npm run dev` - Start development server with Turbo mode (port 3000, or next available)
- `npm run build` - Build production bundle
- `npm run start` - Start production server
- `npm run preview` - Build and start production server

### Code Quality
- `npm run check` - Run Biome linter/formatter checks
- `npm run check:write` - Run Biome with auto-fix
- `npm run check:unsafe` - Run Biome with unsafe auto-fix
- `npm run typecheck` - Run TypeScript type checking

### Database Management
- `npm run db:push` - Push schema changes to database (use for development)
- `npm run db:generate` - Generate Prisma migrations
- `npm run db:migrate` - Deploy migrations
- `npm run db:studio` - Open Prisma Studio GUI

## Project Overview

**RepostLens** - An SEO semantic hijacking analysis tool that helps identify content optimization opportunities based on Google Search Console data.

## Architecture Overview

This is a T3 Stack application using:
- **Next.js 15** with App Router and React Server Components
- **tRPC v11** for type-safe API layer
- **Prisma** as the ORM with SQLite database
- **NextAuth.js v5** for authentication (Discord provider configured)
- **Tailwind CSS v4** for styling with custom Design System
- **Biome** for linting and formatting
- **OpenAI API** for content analysis

### Key Architectural Patterns

1. **tRPC API Structure**
   - API routes defined in `src/server/api/routers/`
     - `search.ts` - Handles Google Search Console data fetching
     - `optimize.ts` - Performs AI-powered content analysis
     - `chat.ts` - Google Chat webhook integration for sending analysis reports
     - `post.ts` - Basic CRUD operations (from T3 template)
   - Router composition in `src/server/api/root.ts`
   - Two procedure types: `publicProcedure` and `protectedProcedure`
   - Context includes database and session

2. **Design System**
   - **"Data Editorial"** theme with Brutalist/Typography-heavy approach
   - CSS Variables in `src/styles/globals.css`
   - Custom animations and transitions
   - Responsive grid system

3. **Component Architecture**
   - Main page component: `src/app/page.tsx` - Handles search and data display
   - Modal component: `src/components/AnalysisModal.tsx` - Uses React Portal for analysis display
   - Analysis extractor: `src/utils/analysisExtractor.ts` - Parses and formats analysis for Google Chat
   - Client-side state management with React hooks

4. **SEO Analysis Logic**
   - Best Query: Target keyword (rank 1-3) to strengthen
   - Rank 4-10: Keywords to use as semantic hijacking tools
   - Content strategy: REPOST (≤20% changes) vs NEW POST (>20% changes)
   - AI evaluates which keywords are "hard to hijack" in existing content

5. **Environment Variables** (required in `.env`)
   - `DATABASE_URL` - Prisma database connection
   - `NEXTAUTH_SECRET` - NextAuth session secret
   - `NEXTAUTH_URL` - Application URL
   - `AUTH_DISCORD_ID` - Discord OAuth app ID
   - `AUTH_DISCORD_SECRET` - Discord OAuth secret
   - `OPENAI_API_KEY` - OpenAI API key for content analysis
   - `GOOGLE_CHAT_WEBHOOK_URL` - (Optional) Google Chat webhook for sending analysis reports

### Content Strategy Decision Logic

The AI analysis determines content strategy based on:
- **REPOST**: When existing content can handle optimization with ≤20% changes
- **NEW POST**: When keywords are "hard/impossible to hijack" in current content (>20% changes needed)
- Focus: Remove content that doesn't fit new angle, then assess change percentage