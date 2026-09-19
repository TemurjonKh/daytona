This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.


## Deployment

1. Import https://github.com/TemurjonKh/daytona into Vercel using the native Next.js preset.
2. Add the environment variables below in Vercel for Production (and Preview if needed). Never commit real credentials.
3. Deploy.
4. Add the DNSimple custom domain in Vercel.
5. Copy the DNS records Vercel provides for that domain.
6. Add those exact DNS records in DNSimple; preserve unrelated DNS records.
7. Wait for domain verification and HTTPS.
8. Test the production site: URL extraction, poster upload, service worker registration, and notification permission/subscription on the custom domain.

### Environment variables

Copy values manually from your secure configuration, using rotated API credentials where applicable:

- `OPENAI_API_KEY`: server-side OpenAI credential.
- `OPENAI_MODEL`: your account-accessible model supporting structured output and images; the existing default is `gpt-4.1-mini`. Validate access before selecting another model.
- `DAYTONA_API_KEY`: server-side Daytona credential.
- `DAYTONA_API_URL`: `https://app.daytona.io/api`.
- `DAYTONA_TARGET`: `us`.
- `VAPID_PUBLIC_KEY`: existing public key; the browser obtains it from `/api/subscribe`.
- `VAPID_PRIVATE_KEY`: matching existing private key, server-side only. Do not regenerate the pair during deployment.

Do not prefix secret variables with `NEXT_PUBLIC_`. `.env.example` contains blank credential placeholders; `.env.local` is ignored.

### Production limitations

- Daytona sandbox networking depends on organization policy. This organization's policy blocks arbitrary outbound domains; GitHub rendering was verified, while Luma/example.com are restricted.
- Background reminder scheduling is not guaranteed on serverless Vercel instances. The current scheduler is optimized for a local persistent process. Subscriptions and pending reminders live in process memory and are not shared across instances or retained across restarts.
- The custom HTTPS domain is a new browser origin: allow notifications and subscribe there again, using the existing VAPID pair.
- Function execution limits and request-size limits depend on the deployment platform; verify long investigations and poster uploads in production.

No custom `vercel.json` is required for the current native Next.js setup. Local production smoke check: `npm run build`, then `npm start`.

References: [Vercel custom domains](https://vercel.com/docs/domains/working-with-domains/add-a-domain), [Vercel environment variables](https://vercel.com/docs/environment-variables).
