export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/mp' || url.pathname.startsWith('/mp/')) {
      const room = (url.searchParams.get('room') || 'main').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || 'main';
      return env.CITY_ROOM.get(env.CITY_ROOM.idFromName(room)).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};
