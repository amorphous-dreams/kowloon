// /routes/files/list.js
// GET /files - List the authenticated user's uploaded files

import makeCollection from '../utils/makeCollection.js';
import File from '#schema/File.js';

export default makeCollection({
  model: File,
  buildQuery: (req, { query, user }) => {
    const filter = { actorId: user.id, deletedAt: null };
    if (query.type) filter.type = query.type; // Image, Video, Audio, Document
    return filter;
  },
  defaultLimit: 20,
  maxLimit: 100,
  routeOpts: { allowUnauth: false },
});
