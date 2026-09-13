import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { ApiError, network } from './network.mjs';
import { caption } from './content.mjs';

export function capabilities(env, accounts) {
  return {
    instagram: { automatic: !!(accounts.instagram && env.SOCIAL_INSTAGRAM_ENABLED === 'true' && /^v\d+\.\d+$/.test(env.SOCIAL_META_API_VERSION || '') && /^\d+$/.test(env.SOCIAL_INSTAGRAM_USER_ID || '') && env.SOCIAL_INSTAGRAM_PAGE_TOKEN), reason: 'Requiere Instagram profesional, pagina de marca vinculada y permisos oficiales de Meta.' },
    tiktok: { automatic: false, reason: 'TikTok excluye herramientas internas de equipo de su API Direct Post. Carga manual preparada.' },
    youtube: { automatic: !!(accounts.youtube && env.SOCIAL_YOUTUBE_ENABLED === 'true' && env.SOCIAL_YOUTUBE_AUDITED === 'true' && /^UC[\w-]{22}$/.test(env.SOCIAL_YOUTUBE_CHANNEL_ID || '') && env.SOCIAL_YOUTUBE_CLIENT_ID && env.SOCIAL_YOUTUBE_CLIENT_SECRET && env.SOCIAL_YOUTUBE_REFRESH_TOKEN), reason: 'Requiere OAuth del canal oficial y proyecto aprobado para cargas publicas. Sin auditoria: carga manual.' }
  };
}

export function publishers(env = process.env, fetchImpl = fetch) {
  const request = network(fetchImpl);
  const json = async (url, options) => {
    try { return await (await request(url, options)).json(); }
    catch (e) { if (e instanceof ApiError) throw e; throw new ApiError('NETWORK_UNCERTAIN'); }
  };
  async function youtubeToken() {
    const data = await json('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', client_id: env.SOCIAL_YOUTUBE_CLIENT_ID, client_secret: env.SOCIAL_YOUTUBE_CLIENT_SECRET, refresh_token: env.SOCIAL_YOUTUBE_REFRESH_TOKEN }) });
    if (!data.access_token) throw new ApiError('AUTH_OR_PERMISSION');
    return data.access_token;
  }
  async function identify(platform, account) {
    if (!capabilities(env, { [platform]: account })[platform]?.automatic) throw new ApiError('NOT_READY');
    if (platform === 'instagram') {
      const token = env.SOCIAL_INSTAGRAM_PAGE_TOKEN;
      const base = `https://graph.facebook.com/${env.SOCIAL_META_API_VERSION}`;
      const data = await json(`${base}/${env.SOCIAL_INSTAGRAM_USER_ID}?fields=id,username`, { headers: { Authorization: `Bearer ${token}` } });
      if (data.id !== env.SOCIAL_INSTAGRAM_USER_ID || data.username?.toLowerCase() !== account.handle.toLowerCase()) throw new ApiError('ACCOUNT_MISMATCH');
      return { token, id: data.id, handle: data.username, base };
    }
    const token = await youtubeToken();
    const data = await json('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', { headers: { Authorization: `Bearer ${token}` } });
    const channel = data.items?.find(item => item.id === env.SOCIAL_YOUTUBE_CHANNEL_ID);
    if (data.items?.length !== 1 || !channel || channel.snippet?.customUrl?.replace(/^@/, '').toLowerCase() !== account.handle.toLowerCase()) throw new ApiError('ACCOUNT_MISMATCH');
    return { token, id: channel.id, handle: account.handle };
  }

  async function publish(platform, { account, state, file, coverAt, checkpoint, visibility = 'public', synthetic = false, madeForKids = false }) {
    const identity = await identify(platform, account);
    const auth = { Authorization: `Bearer ${identity.token}` };
    const bytes = (await fs.stat(file)).size;
    if (platform === 'instagram') {
      const limit = await json(`${identity.base}/${identity.id}/content_publishing_limit?fields=config,quota_usage`, { headers: auth });
      const quota = limit.data?.[0];
      if (quota?.config?.quota_total && quota.quota_usage >= quota.config.quota_total) throw new ApiError('QUOTA');
      await checkpoint({ phase: 'creating_container', accountId: identity.id });
      const container = await json(`${identity.base}/${identity.id}/media`, { method: 'POST', headers: auth, body: new URLSearchParams({ media_type: 'REELS', upload_type: 'resumable', caption: caption(state.copy), share_to_feed: 'true', thumb_offset: String(Math.round(coverAt * 1000)) }) });
      if (!/^\d+$/.test(container.id || '')) throw new ApiError('MISSING_REMOTE_ID');
      // Construct the documented URL rather than forwarding tokens to arbitrary provider-returned URLs.
      const upload = `https://rupload.facebook.com/ig-api-upload/${env.SOCIAL_META_API_VERSION}/${container.id}`;
      await checkpoint({ phase: 'uploading', containerId: container.id, accountId: identity.id });
      await json(upload, { method: 'POST', headers: { Authorization: `OAuth ${identity.token}`, offset: '0', file_size: String(bytes), 'Content-Length': String(bytes) }, body: createReadStream(file), duplex: 'half' });
      await checkpoint({ phase: 'processing', containerId: container.id, accountId: identity.id });
      // Keep processing resumable: no long polling loop in an HTTP request.
      return { status: 'processing', remote: { phase: 'processing', containerId: container.id, accountId: identity.id } };
    }
    if (platform !== 'youtube') throw new ApiError('NOT_READY');
    if (!['public', 'unlisted', 'private'].includes(visibility)) throw new ApiError('NETWORK_POLICY_BLOCKED');
    await checkpoint({ phase: 'creating_upload', accountId: identity.id });
    const session = await request('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json', 'X-Upload-Content-Length': String(bytes), 'X-Upload-Content-Type': 'video/mp4' }, body: JSON.stringify({ snippet: { title: state.copy.title, description: caption(state.copy), tags: state.copy.hashtags, categoryId: '27', defaultLanguage: 'es' }, status: { privacyStatus: visibility, selfDeclaredMadeForKids: madeForKids, containsSyntheticMedia: synthetic } }) });
    const location = session.headers.get('location');
    if (!location) throw new ApiError('MISSING_REMOTE_ID');
    await checkpoint({ phase: 'uploading', accountId: identity.id });
    const result = await json(location, { method: 'PUT', headers: { ...auth, 'Content-Type': 'video/mp4', 'Content-Length': String(bytes) }, body: createReadStream(file), duplex: 'half' });
    if (!/^[\w-]{11}$/.test(result.id || '')) throw new ApiError('MISSING_REMOTE_ID');
    if (result.snippet?.channelId && result.snippet.channelId !== identity.id) throw new ApiError('ACCOUNT_MISMATCH');
    return { status: 'processing', remote: { phase: 'processing', videoId: result.id, accountId: identity.id, visibility }, url: `https://www.youtube.com/shorts/${result.id}` };
  }

  async function finish(platform, account, state, checkpoint) {
    const identity = await identify(platform, account);
    if (identity.id !== state.remote?.accountId) throw new ApiError('ACCOUNT_MISMATCH');
    const auth = { Authorization: `Bearer ${identity.token}` };
    if (platform === 'instagram') {
      const id = state.remote.containerId;
      if (!/^\d+$/.test(id || '')) throw new ApiError('MISSING_REMOTE_ID');
      const status = await json(`${identity.base}/${id}?fields=status_code`, { headers: auth });
      if (['ERROR', 'EXPIRED'].includes(status.status_code)) throw new ApiError('PROCESSING_FAILED');
      if (status.status_code !== 'FINISHED') throw new ApiError('PROCESSING');
      await checkpoint({ ...state.remote, phase: 'publishing' });
      const posted = await json(`${identity.base}/${identity.id}/media_publish`, { method: 'POST', headers: auth, body: new URLSearchParams({ creation_id: id }) });
      if (!/^\d+$/.test(posted.id || '')) throw new ApiError('MISSING_REMOTE_ID');
      await checkpoint({ ...state.remote, phase: 'published', mediaId: posted.id });
      const media = await json(`${identity.base}/${posted.id}?fields=permalink`, { headers: auth });
      const url = new URL(media.permalink);
      if (url.protocol !== 'https:' || url.hostname.replace(/^www\./, '') !== 'instagram.com' || !/^\/reel\/[\w-]+\/?$/.test(url.pathname)) throw new ApiError('MISSING_REMOTE_ID');
      return { status: 'published', url: url.href, verification: 'official_api' };
    }
    const id = state.remote.videoId;
    if (!/^[\w-]{11}$/.test(id || '')) throw new ApiError('MISSING_REMOTE_ID');
    const data = await json(`https://www.googleapis.com/youtube/v3/videos?part=snippet,status,processingDetails&id=${id}`, { headers: auth });
    const video = data.items?.[0];
    if (!video || video.snippet?.channelId !== identity.id) throw new ApiError('ACCOUNT_MISMATCH');
    if (['failed', 'rejected', 'deleted'].includes(video.status?.uploadStatus) || video.processingDetails?.processingStatus === 'failed') throw new ApiError('PROCESSING_FAILED');
    if (video.status?.uploadStatus !== 'processed' || video.status.privacyStatus !== state.remote.visibility) throw new ApiError('PROCESSING');
    return { status: video.status.privacyStatus === 'public' ? 'published' : 'uploaded', url: `https://www.youtube.com/shorts/${id}`, verification: 'official_api', visibility: video.status.privacyStatus };
  }
  return { identify, publish, finish };
}
