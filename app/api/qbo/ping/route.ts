export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function GET() {
  return new Response(
    JSON.stringify({ 
      ok: true, 
      ts: Date.now(), 
      build: process.env.VERCEL_GIT_COMMIT_SHA ?? 'pm2' 
    }),
    { 
      headers: { 
        'content-type': 'application/json',
        'x-build': process.env.VERCEL_GIT_COMMIT_SHA ?? 'pm2'
      } 
    }
  )
}
