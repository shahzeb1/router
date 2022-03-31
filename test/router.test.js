import './fixes';
import { jest } from '@jest/globals'
import { ok } from '@worker-tools/response-creators';
import { ResolvablePromise } from '@worker-tools/resolvable-promise';

import { WorkerRouter } from '../dist/index.js';

test('environment', () => {
  expect(Request).toBeDefined();
  expect(Response).toBeDefined();
  expect(location).toBeDefined();
  expect(WorkerRouter).toBeDefined();
});

test('request', () => {
  expect(new Request('/item')).toBeDefined()
  expect(new Request('/item').url).toBe(new URL('/item', location.origin).href)
})

test('routes', async () => {
  const router = new WorkerRouter();

  const getCallback = jest.fn(() => ok());
  const postCallback = jest.fn(() => ok());
  const putCallback = jest.fn(() => ok());
  const patchCallback = jest.fn(() => ok());
  const deleteCallback = jest.fn(() => ok());
  const optionsCallback = jest.fn(() => ok());
  const headCallback = jest.fn(() => ok());

  router
    .get('/item', getCallback)
    .post('/item', postCallback)
    .put('/item', putCallback)
    .patch('/item', patchCallback)
    .delete('/item', deleteCallback)
    .options('/item', optionsCallback)
    .head('/item', headCallback)

  const p = await Promise.all([
    router._handle(new Request('/item')),
    router._handle(new Request('/item', { method: 'POST' })),
    router._handle(new Request('/item', { method: 'PUT' })),
    router._handle(new Request('/item', { method: 'PATCH' })),
    router._handle(new Request('/item', { method: 'DELETE' })),
    router._handle(new Request('/item', { method: 'OPTIONS' })),
    router._handle(new Request('/item', { method: 'HEAD' })),
  ]);

  expect(getCallback).toHaveBeenCalled()
  expect(postCallback).toHaveBeenCalled()
  expect(putCallback).toHaveBeenCalled()
  expect(patchCallback).toHaveBeenCalled()
  expect(deleteCallback).toHaveBeenCalled()
  expect(optionsCallback).toHaveBeenCalled()
  expect(headCallback).toHaveBeenCalled()

  return p
})

test('handle', () => {
  expect.hasAssertions();
  const router = new WorkerRouter().get('/', (req, ctx) => {
    expect(req).toBeInstanceOf(Request)
    expect(req.method).toBe('GET')
    expect(req.url).toBe(new URL('/', location.origin).href)
    expect(ctx).toMatchObject({})
    return ok();
  })
  return router._handle(new Request('/'))
})

test('all methods', () => {
  expect.hasAssertions()
  const router = new WorkerRouter().all('/', (req) => {
    expect(req).toBeInstanceOf(Request)
    return ok();
  })
  return Promise.all([
    router._handle(new Request('/', { method: 'POST' })),
    router._handle(new Request('/', { method: 'PUT' })),
    router._handle(new Request('/', { method: 'PATCH' })),
    router._handle(new Request('/', { method: 'DELETE' })),
    router._handle(new Request('/', { method: 'OPTIONS' })),
    router._handle(new Request('/', { method: 'HEAD' })),
  ])
})

test('patterns', () => {
  expect.assertions(3)
  const router = new WorkerRouter().get('/item/:id', (req, ctx) => {
    expect(ctx.match).toBeDefined()
    expect(ctx.match.pathname.input).toBe('/item/3')
    expect(ctx.match.pathname.groups).toMatchObject({ id: '3' })
    return ok();
  })
  return router._handle(new Request('/item/3'))
})

test('multi patterns', () => {
  expect.assertions(3)
  const router = new WorkerRouter().get('/item/:type/:id', (req, ctx) => {
    expect(ctx.match).toBeDefined()
    expect(ctx.match.pathname.input).toBe('/item/soap/3')
    expect(ctx.match.pathname.groups).toMatchObject({ type: 'soap', id: '3' })
    return ok();
  })
  return router._handle(new Request('/item/soap/3'))
})

test('wildcards *', () => {
  expect.assertions(3)
  const router = new WorkerRouter().get('*', (req, ctx) => {
    expect(ctx.match).toBeDefined()
    expect(ctx.match.pathname.input).toBe('/item/soap/3')
    expect(ctx.match.pathname.groups).toMatchObject({ 0: '/item/soap/3' })
    return ok();
  })
  return router._handle(new Request('/item/soap/3'))
})

test('wildcards /*', () => {
  expect.assertions(1);
  const router = new WorkerRouter().get('/*', (req, ctx) => {
    expect(ctx.match.pathname.groups).toMatchObject({ 0: 'item/soap/3' })
    return ok();
  })
  return router._handle(new Request('/item/soap/3'))
})

test('ignores search params and hashes', () => {
  expect.assertions(1);
  const router = new WorkerRouter().get('/item/soap/:id', (req, ctx) => {
    expect(ctx.match.pathname.groups['id']).toBe('3')
    return ok();
  })
  return router._handle(new Request('/item/soap/3?foo=bar#L2'))
})

test('middleware', async () => {
  expect.assertions(2);
  const mw = jest.fn(x => ({ ...x, foo: 'bar' }))
  const router = new WorkerRouter().get('/', mw, (req, ctx) => {
    expect(ctx.foo).toBe('bar')
  })
  const p = router._handle(new Request('/'))
  expect(mw).toHaveBeenCalled()
  return p;
})

test('delegation', () => {
  expect.assertions(2)

  const itemRouter = new WorkerRouter()
    .get('/:type/:id', (req, ctx) => {
      expect(ctx.match.pathname.groups).toMatchObject({ type: 'soap', id: '3' })
    })

  const router = new WorkerRouter()
    .use('/(item|sale)/*', itemRouter)

  return Promise.all([
    router._handle(new Request('/item/soap/3')),
    router._handle(new Request('/sale/soap/3')),
  ]);
})

test('external resources', async () => {
  const callback = jest.fn(() => ok())

  const router = new WorkerRouter()
    .external('https://exmaple.com/*', callback)

  await Promise.all([
    router._handle(new Request('https://exmaple.com/api/call')),
    router._handle(new Request('https://exmaple.com/other/resource')),
    router._handle(new Request('https://exmaple.com/')),
    router._handle(new Request('https://exmaple.com')),

    router._handle(new Request('https://not.example.com/foo/bar')),
    router._handle(new Request('/api/call')),
  ])

  expect(callback).toHaveBeenCalledTimes(4)
})

test('pattern init', async () => {
  const callback = jest.fn(() => ok())

  const router = new WorkerRouter()
    .external({ pathname: '/api/*', baseURL: 'https://example.com' }, callback)

  await router._handle(new Request('https://example.com/api/call'))

  expect(callback).toHaveBeenCalled()
})

test('external resources don\'t match same pathname (iff global location is present)', async () => {
  const callback = jest.fn(() => ok())
  const realCallback = jest.fn(() => ok())

  const router = new WorkerRouter()
    .all('/same', callback)
    .external({ pathname: '/same' }, realCallback)

  await router._handle(new Request('https://exmaple.com/same'))

  expect(callback).not.toHaveBeenCalled()
  expect(realCallback).toHaveBeenCalled()
})

test('fetch event listener', async () => {
  const rp = new ResolvablePromise()
  const theResponse = ok();
  const callback = jest.fn(() => theResponse)
  const router = new WorkerRouter()
    .any('*', callback)

  router.fetchEventListener(new class extends Event {
    constructor() {
      super('fetch')
      this.request = new Request('/')
    }
    respondWith(response) {
      rp.resolve(response)
    }
    waitUntil() {}
  })
  expect(await rp).toBe(theResponse);
  expect(callback).toHaveBeenCalled()
})

test('module fetch export', async () => {
  const envEnv = {}
  const envCtx = { waitUntil() {} }
  const theResponse = ok();
  const router = new WorkerRouter()
    .any('*', (req, { env, waitUntil }) => {
      expect(waitUntil).toBeDefined()
      expect(env).toBe(envEnv)
      return theResponse;
    })
  expect(await router.fetchExport(new Request('/'), envEnv, envCtx)).toBe(theResponse)
})

test('serve callback', async () => {
  const theResponse = ok();
  const callback = jest.fn(() => theResponse)
  const router = new WorkerRouter()
    .any('*', callback)
  expect(await router.serveCallback(new Request('/'), {})).toBe(theResponse)
  expect(callback).toHaveBeenCalled
})
