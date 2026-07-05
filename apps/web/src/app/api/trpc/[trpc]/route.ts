import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { appRouter, createTrpcContext } from '@/server/api'

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: createTrpcContext,
  })

export { handler as GET, handler as POST }
