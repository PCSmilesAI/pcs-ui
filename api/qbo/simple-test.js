export async function GET() {
  return new Response(
    JSON.stringify({
      message: 'QBO API is working!',
      timestamp: new Date().toISOString(),
      route: '/api/qbo/simple-test',
      status: 'success'
    }),
    { 
      status: 200, 
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      } 
    }
  );
}
