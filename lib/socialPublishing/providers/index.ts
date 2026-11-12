import type { SocialProvider, SocialProviderAdapter } from '../types';
import { facebookProvider, instagramProvider } from './meta';
import { googleBusinessProvider } from './google';
import { linkedinProvider } from './linkedin';

const providers: Record<SocialProvider, SocialProviderAdapter> = { INSTAGRAM: instagramProvider, FACEBOOK: facebookProvider, GOOGLE_BUSINESS: googleBusinessProvider, LINKEDIN: linkedinProvider };
export function getSocialProvider(provider: SocialProvider): SocialProviderAdapter { return providers[provider]; }
export { getOAuthConfiguration, buildOAuthAuthorizationUrl, exchangeOAuthCode, refreshSocialCredentials, providerScopes } from './oauth';
export { supportedFormats, validateContent } from './validation';
