/**
 * Normalizador do output do actor apify~instagram-profile-scraper.
 *
 * O shape do dataset varia entre versões do actor; mapeamos os campos comuns
 * defensivamente (vários aliases) e ignoramos o resto. Strings são capadas p/
 * não inflar o contexto do agente.
 */

export interface InstagramPost {
  caption: string
  likes?: number
  comments?: number
  timestamp?: string
  type?: string
}

export interface InstagramProfile {
  username: string
  fullName?: string
  bio?: string
  followers?: number
  following?: number
  postsCount?: number
  verified?: boolean
  profilePictureUrl?: string
  posts: InstagramPost[]
}

const MAX_BIO = 2000
const MAX_CAPTION = 2000

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

function str(v: unknown, max?: number): string | undefined {
  if (typeof v !== 'string' || !v) return undefined
  return max ? v.slice(0, max) : v
}

/** Pega o 1º item com cara de perfil e normaliza. Retorna null se vazio. */
export function normalizeInstagramProfile(
  items: unknown[],
  maxPosts = 5,
): InstagramProfile | null {
  const first = items.find((i) => i && typeof i === 'object') as
    | Record<string, unknown>
    | undefined
  if (!first) return null

  const username = str(first.username) ?? str(first.ownerUsername) ?? str(first.handle)
  if (!username) return null

  const rawPosts = (Array.isArray(first.latestPosts)
    ? first.latestPosts
    : Array.isArray(first.posts)
      ? first.posts
      : []) as Array<Record<string, unknown>>

  const posts: InstagramPost[] = rawPosts.slice(0, maxPosts).map((p) => ({
    caption: str(p.caption, MAX_CAPTION) ?? str(p.text, MAX_CAPTION) ?? '',
    likes: num(p.likesCount) ?? num(p.likes),
    comments: num(p.commentsCount) ?? num(p.comments),
    timestamp: str(p.timestamp) ?? str(p.takenAt),
    type: str(p.type) ?? str(p.__typename),
  }))

  return {
    username,
    fullName: str(first.fullName) ?? str(first.full_name),
    bio: str(first.biography, MAX_BIO) ?? str(first.bio, MAX_BIO),
    followers: num(first.followersCount) ?? num(first.followers),
    following: num(first.followsCount) ?? num(first.following),
    postsCount: num(first.postsCount),
    verified:
      typeof first.verified === 'boolean'
        ? first.verified
        : typeof first.isVerified === 'boolean'
          ? first.isVerified
          : undefined,
    profilePictureUrl: str(first.profilePicUrl) ?? str(first.profilePicUrlHD),
    posts,
  }
}
