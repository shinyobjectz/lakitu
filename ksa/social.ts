/**
 * Social Media KSA - Knowledge, Skills, and Abilities
 *
 * Scrape and analyze social media profiles and content across platforms.
 * Supports: TikTok, Instagram, YouTube, Twitter/X, LinkedIn, Facebook, Reddit, and more.
 */

import { callGateway } from "./_shared/gateway";

// ============================================================================
// Types
// ============================================================================

export interface SocialProfile {
  username: string;
  displayName: string;
  bio?: string;
  followers: number;
  following?: number;
  posts?: number;
  verified?: boolean;
  profileUrl: string;
  avatarUrl?: string;
  platform: string;
}

export interface SocialPost {
  id: string;
  text?: string;
  url: string;
  author: string;
  platform: string;
  createdAt?: string;
  likes?: number;
  comments?: number;
  shares?: number;
  views?: number;
  media?: { type: "image" | "video"; url: string }[];
}

export interface SocialSearchResult {
  profiles: SocialProfile[];
  posts: SocialPost[];
}

// ============================================================================
// Profile Functions
// ============================================================================

/**
 * Get a TikTok user profile.
 *
 * @param username - TikTok username (without @)
 * @returns Profile information
 *
 * @example
 * const profile = await tiktokProfile('charlidamelio');
 * console.log(`${profile.displayName}: ${profile.followers} followers`);
 */
export async function tiktokProfile(username: string): Promise<SocialProfile> {
  const data = await callGateway<any>("services.ScrapeCreators.internal.call", {
    endpoint: "/v1/tiktok/user/info",
    params: { handle: username },
  });
  const user = data.data?.user || data.user || data;
  return {
    username: user.uniqueId || username,
    displayName: user.nickname || user.uniqueId,
    bio: user.signature,
    followers: user.followerCount || 0,
    following: user.followingCount,
    posts: user.videoCount,
    verified: user.verified,
    profileUrl: `https://tiktok.com/@${username}`,
    avatarUrl: user.avatarMedium,
    platform: "tiktok",
  };
}

/**
 * Get an Instagram user profile.
 *
 * @param username - Instagram username
 * @returns Profile information
 *
 * @example
 * const profile = await instagramProfile('instagram');
 * console.log(`${profile.displayName}: ${profile.followers} followers`);
 */
export async function instagramProfile(username: string): Promise<SocialProfile> {
  const data = await callGateway<any>("services.ScrapeCreators.internal.call", {
    endpoint: "/v2/instagram/user/info",
    params: { handle: username },
  });
  const user = data.data?.user || data.user || data;
  return {
    username: user.username || username,
    displayName: user.full_name || user.username,
    bio: user.biography,
    followers: user.follower_count || user.edge_followed_by?.count || 0,
    following: user.following_count || user.edge_follow?.count,
    posts: user.media_count || user.edge_owner_to_timeline_media?.count,
    verified: user.is_verified,
    profileUrl: `https://instagram.com/${username}`,
    avatarUrl: user.profile_pic_url,
    platform: "instagram",
  };
}

/**
 * Get a YouTube channel profile.
 *
 * @param channelId - YouTube channel ID or handle
 * @returns Profile information
 *
 * @example
 * const profile = await youtubeProfile('@MrBeast');
 * console.log(`${profile.displayName}: ${profile.followers} subscribers`);
 */
export async function youtubeProfile(channelId: string): Promise<SocialProfile> {
  const data = await callGateway<any>("services.ScrapeCreators.internal.call", {
    endpoint: "/v1/youtube/channel/info",
    params: { handle: channelId },
  });
  const channel = data.data || data;
  return {
    username: channel.customUrl || channel.id || channelId,
    displayName: channel.title || channel.snippet?.title,
    bio: channel.description || channel.snippet?.description,
    followers: channel.subscriberCount || channel.statistics?.subscriberCount || 0,
    posts: channel.videoCount || channel.statistics?.videoCount,
    verified: channel.isVerified,
    profileUrl: `https://youtube.com/${channelId}`,
    avatarUrl: channel.thumbnail || channel.snippet?.thumbnails?.default?.url,
    platform: "youtube",
  };
}

/**
 * Get a Twitter/X user profile.
 *
 * @param username - Twitter username (without @)
 * @returns Profile information
 *
 * @example
 * const profile = await twitterProfile('elonmusk');
 * console.log(`${profile.displayName}: ${profile.followers} followers`);
 */
export async function twitterProfile(username: string): Promise<SocialProfile> {
  const data = await callGateway<any>("services.ScrapeCreators.internal.call", {
    endpoint: "/v2/twitter/user/info",
    params: { handle: username },
  });
  const user = data.data?.user?.result?.legacy || data.user || data;
  return {
    username: user.screen_name || username,
    displayName: user.name,
    bio: user.description,
    followers: user.followers_count || 0,
    following: user.friends_count,
    posts: user.statuses_count,
    verified: user.verified || user.is_blue_verified,
    profileUrl: `https://twitter.com/${username}`,
    avatarUrl: user.profile_image_url_https,
    platform: "twitter",
  };
}

/**
 * Get a LinkedIn user or company profile.
 *
 * @param handle - LinkedIn username or company URL slug
 * @param type - 'person' or 'company'
 * @returns Profile information
 *
 * @example
 * const profile = await linkedinProfile('microsoft', 'company');
 * console.log(`${profile.displayName}: ${profile.followers} followers`);
 */
export async function linkedinProfile(
  handle: string,
  type: "person" | "company" = "person"
): Promise<SocialProfile> {
  const endpoint =
    type === "company"
      ? "/v1/linkedin/company/info"
      : "/v1/linkedin/person/info";

  const data = await callGateway<any>("services.ScrapeCreators.internal.call", {
    endpoint,
    params: { handle },
  });
  const profile = data.data || data;
  return {
    username: handle,
    displayName: profile.name || profile.firstName + " " + profile.lastName,
    bio: profile.headline || profile.description,
    followers: profile.followerCount || 0,
    profileUrl: `https://linkedin.com/${type === "company" ? "company" : "in"}/${handle}`,
    avatarUrl: profile.profilePicture || profile.logo,
    platform: "linkedin",
  };
}

// ============================================================================
// Content Functions
// ============================================================================

/**
 * Get recent posts from a TikTok user.
 *
 * @param username - TikTok username
 * @param limit - Maximum posts to return (default: 10)
 * @returns Array of posts
 *
 * @example
 * const posts = await tiktokPosts('charlidamelio', 5);
 * for (const post of posts) {
 *   console.log(`${post.views} views: ${post.text?.slice(0, 50)}`);
 * }
 */
export async function tiktokPosts(username: string, limit = 10): Promise<SocialPost[]> {
  const data = await callGateway<any>("services.ScrapeCreators.internal.call", {
    endpoint: "/v1/tiktok/user/posts",
    params: { handle: username, count: limit },
  });
  const videos = data.data?.videos || data.videos || [];
  return videos.map((v: any) => ({
    id: v.id,
    text: v.desc || v.description,
    url: v.video?.playAddr || `https://tiktok.com/@${username}/video/${v.id}`,
    author: username,
    platform: "tiktok",
    createdAt: v.createTime ? new Date(v.createTime * 1000).toISOString() : undefined,
    likes: v.stats?.diggCount || v.diggCount,
    comments: v.stats?.commentCount || v.commentCount,
    shares: v.stats?.shareCount || v.shareCount,
    views: v.stats?.playCount || v.playCount,
  }));
}

/**
 * Get recent posts from an Instagram user.
 *
 * @param username - Instagram username
 * @param limit - Maximum posts to return (default: 10)
 * @returns Array of posts
 *
 * @example
 * const posts = await instagramPosts('instagram', 5);
 * for (const post of posts) {
 *   console.log(`${post.likes} likes: ${post.text?.slice(0, 50)}`);
 * }
 */
export async function instagramPosts(username: string, limit = 10): Promise<SocialPost[]> {
  const data = await callGateway<any>("services.ScrapeCreators.internal.call", {
    endpoint: "/v2/instagram/user/posts",
    params: { handle: username, count: limit },
  });
  const posts = data.data?.posts || data.posts || [];
  return posts.map((p: any) => ({
    id: p.id || p.pk,
    text: p.caption?.text || p.caption,
    url: p.permalink || `https://instagram.com/p/${p.code || p.shortcode}`,
    author: username,
    platform: "instagram",
    createdAt: p.taken_at ? new Date(p.taken_at * 1000).toISOString() : undefined,
    likes: p.like_count || p.edge_liked_by?.count,
    comments: p.comment_count || p.edge_media_to_comment?.count,
    views: p.video_view_count || p.play_count,
  }));
}

/**
 * Get recent tweets from a Twitter/X user.
 *
 * @param username - Twitter username
 * @param limit - Maximum tweets to return (default: 10)
 * @returns Array of posts
 *
 * @example
 * const tweets = await twitterPosts('elonmusk', 5);
 * for (const tweet of tweets) {
 *   console.log(`${tweet.likes} likes: ${tweet.text?.slice(0, 50)}`);
 * }
 */
export async function twitterPosts(username: string, limit = 10): Promise<SocialPost[]> {
  const data = await callGateway<any>("services.ScrapeCreators.internal.call", {
    endpoint: "/v2/twitter/user/tweets",
    params: { handle: username, count: limit },
  });
  const tweets = data.data?.tweets || data.tweets || [];
  return tweets.map((t: any) => ({
    id: t.id_str || t.id,
    text: t.full_text || t.text,
    url: `https://twitter.com/${username}/status/${t.id_str || t.id}`,
    author: username,
    platform: "twitter",
    createdAt: t.created_at,
    likes: t.favorite_count,
    comments: t.reply_count,
    shares: t.retweet_count,
    views: t.views?.count,
  }));
}

// ============================================================================
// Search Functions
// ============================================================================

/**
 * Search for social media content across platforms.
 *
 * @param query - Search query
 * @param platform - Platform to search (tiktok, instagram, twitter, youtube)
 * @param limit - Maximum results (default: 10)
 * @returns Search results
 *
 * @example
 * const results = await searchSocial('AI news', 'twitter', 10);
 * for (const post of results.posts) {
 *   console.log(`[${post.author}] ${post.text?.slice(0, 50)}`);
 * }
 */
export async function searchSocial(
  query: string,
  platform: "tiktok" | "instagram" | "twitter" | "youtube",
  limit = 10
): Promise<SocialSearchResult> {
  const endpoints: Record<string, string> = {
    tiktok: "/v1/tiktok/search",
    instagram: "/v2/instagram/search",
    twitter: "/v2/twitter/search",
    youtube: "/v1/youtube/search",
  };

  const data = await callGateway<any>("services.ScrapeCreators.internal.call", {
    endpoint: endpoints[platform],
    params: { query, count: limit },
  });

  const results = data.data || data;
  return {
    profiles: (results.users || []).map((u: any) => ({
      username: u.username || u.uniqueId || u.screen_name,
      displayName: u.nickname || u.name || u.full_name,
      followers: u.followerCount || u.followers_count || 0,
      profileUrl: u.url || "",
      platform,
    })),
    posts: (results.videos || results.tweets || results.posts || []).map((p: any) => ({
      id: p.id || p.id_str,
      text: p.desc || p.full_text || p.text || p.caption,
      url: p.url || "",
      author: p.author?.username || p.user?.screen_name || "",
      platform,
      likes: p.stats?.diggCount || p.favorite_count || p.like_count,
      views: p.stats?.playCount || p.views?.count,
    })),
  };
}
