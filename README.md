# Create T3 App

This is a [T3 Stack](https://create.t3.gg/) project bootstrapped with `create-t3-app`.

## What's next? How do I make an app with this?

We try to keep this project as simple as possible, so you can start with just the scaffolding we set up for you, and add additional things later when they become necessary.

If you are not familiar with the different technologies used in this project, please refer to the respective docs. If you still are in the wind, please join our [Discord](https://t3.gg/discord) and ask for help.

- [Next.js](https://nextjs.org)
- [NextAuth.js](https://next-auth.js.org)
- [Prisma](https://prisma.io)
- [Drizzle](https://orm.drizzle.team)
- [Tailwind CSS](https://tailwindcss.com)
- [tRPC](https://trpc.io)

## Learn More

To learn more about the [T3 Stack](https://create.t3.gg/), take a look at the following resources:

- [Documentation](https://create.t3.gg/)
- [Learn the T3 Stack](https://create.t3.gg/en/faq#what-learning-resources-are-currently-available) — Check out these awesome tutorials

You can check out the [create-t3-app GitHub repository](https://github.com/t3-oss/create-t3-app) — your feedback and contributions are welcome!

## How do I deploy this?

Follow our deployment guides for [Vercel](https://create.t3.gg/en/deployment/vercel), [Netlify](https://create.t3.gg/en/deployment/netlify) and [Docker](https://create.t3.gg/en/deployment/docker) for more information.
## REST API quick test (copy-paste safe)

The most common error when testing is pasting a URL with a line break inside the JSON (e.g. after `/458268/`). Use one of the commands below — they keep the URL on a single line so the JSON stays valid.

Search data for a specific URL (single line)

```
curl -sS 'http://localhost:3000/api/search/by-url' \
  -H 'content-type: application/json' \
  --data-raw '{"site":"sc-domain:holidaysmart.io","page":"https://holidaysmart.io/hk/article/458268/%E5%B1%AF%E9%96%80"}' \
  | jq
```

Multi-line (be sure each line ends with a backslash; no trailing spaces)

```
curl -sS 'http://localhost:3000/api/search/by-url' \
  -H 'content-type: application/json' \
  --data-raw '{"site":"sc-domain:holidaysmart.io","page":"https://holidaysmart.io/hk/article/458268/%E5%B1%AF%E9%96%80"}' \
  | jq
```

Build JSON with jq (avoids manual quoting/line breaks)

```
jq -nc --arg site 'sc-domain:holidaysmart.io' --arg page 'https://holidaysmart.io/hk/article/458268/%E5%B1%AF%E9%96%80' \
  '{"site":$site,"page":$page}' \
| curl -sS 'http://localhost:3000/api/search/by-url' \
    -H 'content-type: application/json' \
    --data-binary @- \
| jq
```

Heredoc (also safe from accidental line breaks)

```
curl -sS 'http://localhost:3000/api/search/by-url' \
  -H 'content-type: application/json' \
  --data-binary @- <<'JSON' | jq
{"site":"sc-domain:holidaysmart.io","page":"https://holidaysmart.io/hk/article/458268/%E5%B1%AF%E9%96%80"}
JSON
```

Tip: if your terminal wraps long lines visually, that’s fine; do not insert an actual newline inside the JSON string.

More endpoints

- List data (like homepage list)

```
curl -sS 'http://localhost:3000/api/search/list' \
  -H 'content-type: application/json' \
  --data-raw '{"site":"sc-domain:holidaysmart.io"}' \
  | jq
```

- Analyze (generate analysis + sections)

```
curl -sS 'http://localhost:3000/api/optimize/analyze' \
  -H 'content-type: application/json' \
  --data-raw '{"page":"https://holidaysmart.io/hk/article/458268/%E5%B1%AF%E9%96%80","bestQuery":null,"bestQueryClicks":null,"bestQueryPosition":null,"prevBestQuery":null,"prevBestPosition":null,"prevBestClicks":null,"rank4":null,"rank5":null,"rank6":null,"rank7":null,"rank8":null,"rank9":null,"rank10":null}' \
  | jq
```

- Context vector (analysis + original page)

```
curl -sS 'http://localhost:3000/api/report/context-vector' \
  -H 'content-type: application/json' \
  --data-raw '{"analysisText":"(paste analysis here)","pageUrl":"https://holidaysmart.io/hk/article/458268/%E5%B1%AF%E9%96%80"}' \
  | jq
```
