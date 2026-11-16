/** Browser half: friends dialog, share action, and Remote mounting. */
import type { Context } from '@deepseek-ai/cordis'
import remote from '@deepseek-ai/dsh-social/remote'
import { mountSocial } from './mount.ts'
import type { SocialKey } from './locales.ts'

export { inject } from './mount.ts'
export type { SocialFriendsInjected, FriendsPanelProps } from './FriendsPanel.tsx'
export type { SocialShareInjected, ShareActionProps } from './ShareAction.tsx'
export type { SocialKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Friends and read-only share UI copy. */
    social: SocialKey
  }
}

/**
 * Mount the social Remote contribution and UI slots.
 * @param ctx - browser plugin context.
 */
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  return await mountSocial(ctx, remote)
}
